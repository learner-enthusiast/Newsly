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
} from "@/repositories/newsStory";
import { serpEngines } from "@/SERP/index";
import { normalizeSerpArticles } from "@/services/news/normalizeArticles";
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
  },
  async ({ event, step }) => {
    const input = newsPipelineEventDataSchema.parse(event.data);
    const location = input.location?.trim() || null;
    const scope = input.scope;
    const plannerType = scope === "local" ? ("LOCAL" as const) : ("WORLD" as const);

    const newsRequest = await step.run("load-news-request", async () => {
      const row = await getNewsRequestByIdForUser(
        input.newsRequestId,
        input.userId,
      );
      if (!row) {
        throw new Error("News request not found for user");
      }
      return row;
    });

    try {
      const plans = await step.run("plan-search-queries", async () => {
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
        return { news, search };
      });

      await step.run("save-search-queries", async () =>
        patchNewsRequest(newsRequest.id, {
          searchQuery: {
            news: plans.news.query,
            search: plans.search.query,
          },
        }),
      );

      const serp = await step.run("fetch-serp-results", async () => {
        const gl = plans.news.suggestedGl ?? plans.search.suggestedGl;
        const hl = plans.news.suggestedHl ?? "en";
        const shared = { num: 10, ...(gl ? { gl } : {}), hl };

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

        return { googleNewsPayload, googleSearchPayload };
      });

      const normalized = await step.run("normalize-articles", async () =>
        normalizeSerpArticles({
          googleNewsPayload: serp.googleNewsPayload,
          googleSearchPayload: serp.googleSearchPayload,
          limitPerEngine: 10,
        }),
      );

      const selected = await step.run("select-articles", async () =>
        runResearchArticleSelectorAgent({
          userPrompt: buildResearchPrompt({
            date: input.date,
            location,
            scope,
          }),
          links: normalized.map((article) => ({
            url: article.url,
            title: article.title,
            snippet: article.snippet,
            source: article.source,
            sourceType: article.sourceType,
          })),
          topPercent: 50,
        }),
      );

      const researched = await step.run("scrape-selected-articles", async () => {
        const articles = [];
        for (let index = 0; index < selected.length; index += 1) {
          const article = selected[index] as SelectedResearchArticle;
          const normalizedMatch = normalized.find((row) => row.url === article.url);
          let scrapedContent: string | null = null;
          try {
            const scraped = await firecrawlClient.scrape({ url: article.url });
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
        return articles;
      });

      const synthesized = await step.run("synthesize-stories", async () =>
        runNewsSynthesizerAgent({
          newsRequestId: newsRequest.id,
          location,
          articles: researched,
          userPrompt: buildResearchPrompt({
            date: input.date,
            location,
            scope,
          }),
        }),
      );

      await step.run("persist-stories-and-sources", async () => {
        for (const story of synthesized) {
          const savedStory = await createNewsStory({
            newsRequestId: newsRequest.id,
            title: story.title,
            slug: story.slug,
            summary: story.summary,
            content: story.content,
            category: story.category,
            location: story.location,
            publishedAt: story.publishedAt,
            importanceScore: story.importanceScore,
          });

          for (const source of story.sources) {
            await createNewsSource({
              newsStoryId: savedStory.id,
              url: source.url,
              domain: source.domain,
              title: source.title,
              scrapedContent: source.scrapedContent,
              publishedAt: source.publishedAt,
              sourceType: source.sourceType,
            });
          }
        }
      });

      await step.run("mark-request-success", async () =>
        patchNewsRequest(newsRequest.id, {
          status: "success",
          completedAt: new Date(),
          error: null,
        }),
      );

      return step.run("load-stories", async () =>
        listNewsStoriesByNewsRequestId(newsRequest.id),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await step.run("mark-request-failed", async () =>
        patchNewsRequest(newsRequest.id, {
          status: "failed",
          error: message,
          completedAt: new Date(),
        }),
      );
      throw error;
    }
  },
);
