/**
 * Daily news request pipeline
 *
 * Event: news/pipeline.requested
 * Input: { userId, newsRequestId, date, scope, location? }
 *
 * Purpose: Fulfill a user’s “news for date/region” request — plan Serp queries,
 * fetch and normalize articles, select and scrape the best links, cluster them
 * into NewsStory rows with NewsSource children, and mark the request success or
 * failed.
 *
 * Steps:
 * 1. load-news-request — Verify the request exists for the user.
 * 2. plan-search-queries — Build Google News + web news tab query strings.
 * 3. save-search-queries — Store planned queries on the NewsRequest row.
 * 4. fetch-and-normalize-serp — Call Serp, normalize hits, filter by request date.
 * 5. select-articles — LLM picks relevant article URLs to scrape.
 * 6. scrape-selected-articles — Firecrawl each selected URL.
 * 7. synthesize-stories — LLM groups scraped articles into story summaries.
 * 8. persist-stories-and-sources — Write NewsStory + NewsSource records.
 * 9. mark-request-success — Set request status success and completedAt.
 * 10. load-stories — Return persisted stories (function output).
 * 11. mark-request-failed — On error, set request status failed with message.
 */

import { runNewsSynthesizerAgent } from "@/Agents/news/NewsSythesizeragent";
import { runResearchArticleSelectorAgent } from "@/Agents/news/ResearchArticleSelectorAgent";
import { buildNewsSearchQuery } from "@/Agents/news/searchPlanner";
import { inngest } from "@/clients/inngestClient";
import type { SelectedResearchArticle } from "@/Agents/news/ResearchArticleSelectorAgent";
import { firecrawlClient } from "@/clients/FireCrawlClient";
import {
  getNewsRequestByIdForUser,
  newsScopeSchema,
  patchNewsRequest,
} from "@/repositories/newsRequest";
import { createNewsSource } from "@/repositories/newsSource";
import {
  createNewsStory,
  listNewsStoriesByNewsRequestId,
  patchNewsStory,
} from "@/repositories/newsStory";
import { serpEngines } from "@/SERP/index";
import {
  filterArticlesNearRequestDate,
  normalizeSerpArticles,
  slimSerpPayloadForNormalize,
  toJsonSafeStepOutput,
} from "@/services/news/normalizeArticles";
import { z } from "zod";

export const NEWS_PIPELINE_EVENT = "news/pipeline.requested" as const;

export const newsPipelineEventDataSchema = z.object({
  userId: z.string().min(1),
  newsRequestId: z.uuid(),
  location: z.string().min(1).nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scope: newsScopeSchema,
});

export type NewsPipelineEventData = z.infer<typeof newsPipelineEventDataSchema>;

function scrapeMarkdown(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.markdown === "string" && record.markdown.trim()) {
    return record.markdown;
  }
  const data = record.data;
  if (data && typeof data === "object") {
    const markdown = (data as Record<string, unknown>).markdown;
    if (typeof markdown === "string" && markdown.trim()) {
      return markdown;
    }
  }
  return null;
}

const PIPELINE_LOG_PREFIX = "[news-pipeline]";

function pipelineLog(
  step: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  const suffix =
    extra && Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : "";
  console.log(`${PIPELINE_LOG_PREFIX} ${step}: ${message}${suffix}`);
}

function buildResearchPrompt(input: {
  date: string;
  location: string | null;
  scope: "local" | "world";
}): string {
  if (input.scope === "local" && input.location) {
    return `Select articles for stock-market and economic news in ${input.location} on ${input.date}.`;
  }
  return `Select articles for global stock-market and economic news on ${input.date}.`;
}

export const newsPipelineFunction = inngest.createFunction(
  {
    id: "news-pipeline",
    name: "News pipeline",
    triggers: [{ event: NEWS_PIPELINE_EVENT }],
    timeouts: { finish: "45m" },
  },
  async ({ event, step }) => {
    const input = newsPipelineEventDataSchema.parse(event.data);
    const location = input.location?.trim() || null;
    const scope = input.scope;
    const plannerType =
      scope === "local" ? ("LOCAL" as const) : ("WORLD" as const);

    pipelineLog("run", "started", {
      newsRequestId: input.newsRequestId,
      date: input.date,
      scope,
      location,
    });

    pipelineLog("step", "entering load-news-request");
    const newsRequest = await step.run("load-news-request", async () => {
      pipelineLog("load-news-request", "start");
      const row = await getNewsRequestByIdForUser(
        input.newsRequestId,
        input.userId,
      );
      if (!row) {
        throw new Error("News request not found for user");
      }
      pipelineLog("load-news-request", "done", { id: row.id });
      return toJsonSafeStepOutput({ id: row.id });
    });

    try {
      pipelineLog("step", "entering plan-search-queries");
      const plans = await step.run("plan-search-queries", async () => {
        pipelineLog("plan-search-queries", "start");
        const news = buildNewsSearchQuery({
          type: plannerType,
          location: location ?? undefined,
          date: input.date,
          channel: "news",
        });
        const search = buildNewsSearchQuery({
          type: plannerType,
          location: location ?? undefined,
          date: input.date,
          channel: "search",
        });
        pipelineLog("plan-search-queries", "done", {
          newsQuery: news.query,
          searchQuery: search.query,
        });
        return { news, search };
      });

      pipelineLog("step", "entering save-search-queries");
      await step.run("save-search-queries", async () => {
        pipelineLog("save-search-queries", "start");
        await patchNewsRequest(newsRequest.id, {
          searchQuery: {
            news: plans.news.query,
            search: plans.search.query,
          },
        });
        pipelineLog("save-search-queries", "done");
      });

      pipelineLog("step", "entering fetch-and-normalize-serp");
      const normalized = await step.run(
        "fetch-and-normalize-serp",
        async () => {
          pipelineLog("fetch-and-normalize-serp", "start");
          const gl = plans.news.suggestedGl ?? plans.search.suggestedGl;
          const hl = plans.news.suggestedHl ?? "en";
          const shared = { num: 30, ...(gl ? { gl } : {}), hl };

          const [googleNewsPayload, googleSearchPayload] = await Promise.all([
            serpEngines.searchGoogleNews.fn({
              q: plans.news.query,
              ...shared,
            }),
            serpEngines.searchGoogle.fn({
              q: plans.search.query,
              tbm: "nws",
              ...shared,
            }),
          ]);

          const articles = normalizeSerpArticles({
            googleNewsPayload: slimSerpPayloadForNormalize(googleNewsPayload),
            googleSearchPayload:
              slimSerpPayloadForNormalize(googleSearchPayload),
            limitPerEngine: 15,
          });

          const filtered = filterArticlesNearRequestDate(
            articles,
            input.date,
            3,
          );
          pipelineLog("fetch-and-normalize-serp", "done", {
            rawCount: articles.length,
            afterDateFilter: filtered.length,
          });
          return toJsonSafeStepOutput(filtered);
        },
      );

      if (normalized.length === 0) {
        throw new Error("No articles returned from Serp normalization");
      }
      pipelineLog("step", "entering select-articles");
      const selected = await step.run("select-articles", async () => {
        pipelineLog("select-articles", "start", {
          candidateCount: Math.min(normalized.length, 12),
        });
        const links = normalized.slice(0, 12).map((article) => ({
          url: article.url,
          title: article.title,
          snippet: article.snippet,
          source: article.source,
          sourceType: article.sourceType,
        }));

        const result = await runResearchArticleSelectorAgent({
          userPrompt: buildResearchPrompt({
            date: input.date,
            location,
            scope,
          }),
          links,
          topPercent: 80,
          abortSignal: AbortSignal.timeout(180_000),
        });

        pipelineLog("select-articles", "done", {
          selectedCount: result.length,
        });
        return toJsonSafeStepOutput(result);
      });

      pipelineLog("step", "entering scrape-selected-articles");
      const researched = await step.run(
        "scrape-selected-articles",
        async () => {
          pipelineLog("scrape-selected-articles", "start", {
            urlCount: selected.length,
          });
          const articles = [];
          for (let index = 0; index < selected.length; index += 1) {
            pipelineLog("scrape-selected-articles", "scraping", {
              index: index + 1,
              total: selected.length,
              url: selected[index]?.url,
            });
            const article = selected[index] as SelectedResearchArticle;
            const normalizedMatch = normalized.find(
              (row) => row.url === article.url,
            );
            let scrapedContent: string | null = null;
            try {
              const scraped = await firecrawlClient.scrape({
                url: article.url,
              });
              scrapedContent = scrapeMarkdown(scraped);
            } catch {
              scrapedContent = null;
            }

            articles.push({
              index: normalizedMatch?.index ?? index,
              url: article.url,
              domain: article.domain,
              title: article.title,
              sourceType: article.sourceType,
              scrapedContent,
              publishedAt: normalizedMatch?.publishedAt
                ? new Date(normalizedMatch.publishedAt)
                : null,
            });
          }
          pipelineLog("scrape-selected-articles", "done", {
            scrapedCount: articles.length,
            withContent: articles.filter((a) => a.scrapedContent).length,
          });
          return toJsonSafeStepOutput(articles);
        },
      );

      pipelineLog("step", "entering synthesize-stories");
      const synthesized = await step.run("synthesize-stories", async () => {
        pipelineLog("synthesize-stories", "start", {
          articleCount: researched.length,
        });
        const stories = await runNewsSynthesizerAgent({
          newsRequestId: newsRequest.id,
          location,
          articles: researched,
          userPrompt: buildResearchPrompt({
            date: input.date,
            location,
            scope,
          }),
          abortSignal: AbortSignal.timeout(300_000),
        });
        pipelineLog("synthesize-stories", "done", {
          storyCount: stories.length,
        });
        return toJsonSafeStepOutput(stories);
      });

      pipelineLog("step", "entering persist-stories-and-sources");
      await step.run("persist-stories-and-sources", async () => {
        pipelineLog("persist-stories-and-sources", "start", {
          storyCount: synthesized.length,
        });
        for (const story of synthesized) {
          const savedStory = await createNewsStory({
            newsRequestId: newsRequest.id,
            title: story.title,
            description: story.description,
            slug: story.slug,
            summary: story.summary,
            content: story.content,
            category: story.category,
            location: story.location,
            publishedAt: story.publishedAt,
            importanceScore: story.importanceScore,
            newsSourceIds: [],
          });

          const newsSourceIds: string[] = [];
          for (const source of story.sources) {
            const savedSource = await createNewsSource({
              newsStoryId: savedStory.id,
              url: source.url,
              domain: source.domain,
              title: source.title,
              scrapedContent: source.scrapedContent,
              publishedAt: source.publishedAt,
              sourceType: source.sourceType,
            });
            newsSourceIds.push(savedSource.id);
          }

          if (newsSourceIds.length > 0) {
            await patchNewsStory(savedStory.id, { newsSourceIds });
          }
        }
        pipelineLog("persist-stories-and-sources", "done");
      });

      pipelineLog("step", "entering mark-request-success");
      await step.run("mark-request-success", async () => {
        pipelineLog("mark-request-success", "start");
        await patchNewsRequest(newsRequest.id, {
          status: "success",
          completedAt: new Date(),
          error: null,
        });
        pipelineLog("mark-request-success", "done");
      });

      pipelineLog("step", "entering load-stories");
      const stories = await step.run("load-stories", async () => {
        pipelineLog("load-stories", "start");
        const rows = await listNewsStoriesByNewsRequestId(newsRequest.id);
        pipelineLog("load-stories", "done", { count: rows.length });
        return rows;
      });
      pipelineLog("run", "finished", { newsRequestId: newsRequest.id });
      return toJsonSafeStepOutput(stories);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pipelineLog("run", "failed", { error: message });
      pipelineLog("step", "entering mark-request-failed");
      await step.run("mark-request-failed", async () => {
        pipelineLog("mark-request-failed", "start", { error: message });
        await patchNewsRequest(newsRequest.id, {
          status: "failed",
          error: message,
          completedAt: new Date(),
        });
        pipelineLog("mark-request-failed", "done");
      });
      throw error;
    }
  },
);
