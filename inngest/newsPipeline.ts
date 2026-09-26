/**
 * Daily news request pipeline (Inngest)
 *
 * Event: `news/pipeline.requested`
 *
 * Input:
 * - `userId` — app user (Clerk-backed row in `users`)
 * - `newsRequestId` — `NewsRequest` UUID to fulfill
 * - `date` — calendar day for coverage (YYYY-MM-DD)
 * - `scope` — `local` | `world`
 * - `location` — optional; required in practice for `local` scope
 *
 * Purpose:
 * Fulfill a user’s daily stock-market / economic news request. The pipeline
 * searches Google News, Google web news, and YouTube; optionally expands Google
 * search using AI Overview follow-up queries; selects and scrapes web articles;
 * extracts and analyzes YouTube transcripts; merges everything into ranked
 * `NewsStory` rows with `NewsSource` children (including optional `transcript`
 * on sources), then marks the request `success` or `failed`.
 *
 * Shared prompt:
 * `buildResearchPrompt()` drives article selection, YouTube video selection,
 * transcript analysis, transcript fact synthesis, and final story clustering.
 *
 * ── Happy-path steps ───────────────────────────────────────────────────────
 *
 * 1. load-news-request
 *    Verify `NewsRequest` exists for `userId` + `newsRequestId`.
 *
 * 2. plan-search-queries
 *    `buildNewsSearchQuery()` — separate strings for Google News (`channel: news`)
 *    and web news tab (`channel: search`), from date, scope, and location.
 *
 * 3. save-search-queries
 *    Persist `{ news, search }` query strings on `NewsRequest.searchQuery` (JSON).
 *
 * 4. fetch-and-normalize-serp
 *    Parallel Serp:
 *    - `searchGoogleNews` (news query)
 *    - `searchGoogle` with `tbm: nws` (search query)
 *    - `searchYoutube` (search query, top video_results kept for later)
 *    If the Google search payload has `ai_overview`, run
 *    `runGaiOverviewSearchGeneratorAgent`, fetch extra `searchGoogle` (news tab)
 *    hits per generated query, and merge into the base search payload.
 *    Normalize news + search into article links; filter by request date window.
 *    URLs that appear **only** in AI-overview follow-up Serp results get
 *    `selectionWeight: 1.3` (30% boost in the article selector).
 *    Step output: `{ articles, youtubeSerpPayload }` (≤10 video rows).
 *
 * 5–8. YouTube branch (runs in parallel with article branch after step 4)
 *    select-youtube-videos → fetch-youtube-transcripts → analyze-youtube-transcripts
 *    → synthesize-youtube-transcript-facts (same agents/helpers as before).
 *
 * 9–10. Article branch (runs in parallel with YouTube branch after step 4)
 *    select-articles → scrape-selected-articles (Firecrawl, then
 *    `runNewsContentCleanerAgent` per page; invalid/empty scrapes dropped).
 *
 * 11. synthesize-stories (waits for both branches)
 *     `runNewsSynthesizerAgent` on Firecrawl articles plus YouTube rows built by
 *     `buildYoutubeArticlesForSynthesizer` (synthesis facts + transcript excerpt).
 *     Passes `youtubeTranscriptSynthesis`; aims for ≥4 distinct stories when
 *     sources support it; YouTube-derived evidence weighted higher in clustering.
 *
 * 12. persist-stories-and-sources
 *     Create `NewsStory` + `NewsSource` rows; patch `newsSourceIds` on each story.
 *     YouTube watch URLs receive `transcript` from the fetch step when available.
 *
 * 13. mark-request-success
 *     `NewsRequest.status = success`, `completedAt` set.
 *
 * 14. load-stories
 *     Return persisted stories (function output).
 *
 * ── Failure path ─────────────────────────────────────────────────────────────
 *
 * mark-request-failed — On any thrown error in the try block: set request
 * `failed`, store error message, set `completedAt`, rethrow for Inngest retries.
 *
 * Timeout: 45 minutes (`timeouts.finish`).
 */

import { runGaiOverviewSearchGeneratorAgent } from "@/Agents/news/GAIOverviewSearchGeneratorAgents";
import { runNewsContentCleanerAgent } from "@/Agents/news/NewsContentCleanerAgent";
import {
  runNewsSynthesizerAgent,
  storyHasPrimaryArticleSource,
} from "@/Agents/news/NewsSythesizeragent";
import { runResearchArticleSelectorAgent } from "@/Agents/news/ResearchArticleSelectorAgent";
import { buildNewsSearchQuery } from "@/Agents/news/searchPlanner";
import { inngest } from "@/clients/inngestClient";
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
import { scrapeUrlsWithFirecrawl } from "@/services/firecrawl/scrapeUrls";
import { runYoutubeTranscriptSynthesizeAgent } from "@/Agents/news/YoutubeTranscriptSyntesizeAgent";
import { youtubeTranscriptAnalysisSchema } from "@/Agents/news/YoutubeTranscriptAgent";
import {
  analyzeYoutubeTranscriptsInParallel,
  buildYoutubeArticlesForSynthesizer,
  extractTopYoutubeVideoResults,
  fetchYoutubeTranscriptsByVideoIds,
  selectYoutubeVideosForNewsResearch,
} from "@/services/news/youtubeResearch";
import {
  applySelectionWeightBoosts,
  appendGoogleSearchSerpResults,
  excludeTradingRecommendationArticles,
  extractAiOverviewTextFromSerpPayload,
  filterArticlesNearRequestDate,
  followUpBoostedUrlKeys,
  isTradingRecommendationArticle,
  normalizeSerpArticles,
  serpPayloadHasAiOverview,
  slimSerpPayloadForNormalize,
  toJsonSafeStepOutput,
  wrapAiOverviewFollowUpSerpPayload,
} from "@/services/news/normalizeArticles";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
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

const PIPELINE_LOG_PREFIX = "[news-pipeline]";

const DEFAULT_NEWS_SYNTHESIZER_MODEL = "gpt-5.4-mini";

function resolveNewsSynthesizerModel(): string {
  return resolveOpenAiModelId(
    undefined,
    process.env.NEWS_SYNTHESIZER_MODEL ?? DEFAULT_NEWS_SYNTHESIZER_MODEL,
  );
}

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
      const serpBundle = await step.run(
        "fetch-and-normalize-serp",
        async () => {
          pipelineLog("fetch-and-normalize-serp", "start");
          const gl = plans.news.suggestedGl ?? plans.search.suggestedGl;
          const hl = plans.news.suggestedHl ?? "en";
          const shared = { num: 30, ...(gl ? { gl } : {}), hl };

          const [googleNewsPayload, googleSearchPayload, youtubePayload] =
            await Promise.all([
              serpEngines.searchGoogleNews.fn({
                q: plans.news.query,
                ...shared,
              }),
              serpEngines.searchGoogle.fn({
                q: plans.search.query,
                tbm: "nws",
                ...shared,
              }),
              serpEngines.searchYoutube.fn({
                search_query: plans.search.query,
                ...(gl ? { gl } : {}),
                hl,
              }),
            ]);

          let mergedGoogleSearchPayload: unknown = googleSearchPayload;
          let followUpPayloads: unknown[] = [];

          if (serpPayloadHasAiOverview(googleSearchPayload)) {
            const aiOverviewText =
              extractAiOverviewTextFromSerpPayload(googleSearchPayload);
            if (aiOverviewText) {
              pipelineLog(
                "fetch-and-normalize-serp",
                "ai-overview detected, generating follow-up queries",
                { overviewTextLength: aiOverviewText.length },
              );
              const generated = await runGaiOverviewSearchGeneratorAgent({
                aiOverviewText,
                date: input.date,
                location: location ?? undefined,
                scope,
                abortSignal: AbortSignal.timeout(120_000),
              });
              pipelineLog(
                "fetch-and-normalize-serp",
                "ai-overview follow-up queries ready",
                {
                  model: generated.model,
                  queries: generated.queries.map((row) => ({
                    q: row.query,
                    rationale: row.rationale,
                  })),
                },
              );

              followUpPayloads = (
                await Promise.all(
                  generated.queries.map((row) =>
                    serpEngines.searchGoogle.fn({
                      q: row.query,
                      tbm: "nws",
                      ...shared,
                    }),
                  ),
                )
              ).map(wrapAiOverviewFollowUpSerpPayload);
              pipelineLog(
                "fetch-and-normalize-serp",
                "ai-overview follow-up serp fetched",
                { searchCount: followUpPayloads.length },
              );

              mergedGoogleSearchPayload = appendGoogleSearchSerpResults(
                googleSearchPayload,
                followUpPayloads,
              );
            } else {
              pipelineLog(
                "fetch-and-normalize-serp",
                "ai-overview present but no extractable text; skipping follow-up serp",
              );
            }
          }

          const articles = normalizeSerpArticles({
            googleNewsPayload: slimSerpPayloadForNormalize(googleNewsPayload),
            googleSearchPayload:
              slimSerpPayloadForNormalize(mergedGoogleSearchPayload),
            limitPerEngine: 15,
          });

          const filtered = filterArticlesNearRequestDate(articles, input.date);
          const eligible = excludeTradingRecommendationArticles(filtered);
          const boostedUrls = followUpBoostedUrlKeys(
            googleSearchPayload,
            followUpPayloads,
          );
          const weighted = applySelectionWeightBoosts(eligible, boostedUrls);
          pipelineLog("fetch-and-normalize-serp", "done", {
            rawCount: articles.length,
            afterDateFilter: filtered.length,
            afterTradingFilter: eligible.length,
            followUpBoostedUrls: boostedUrls.size,
            youtubeVideoCount: extractTopYoutubeVideoResults(youtubePayload).length,
          });
          return toJsonSafeStepOutput({
            articles: weighted,
            youtubeSerpPayload: {
              video_results: extractTopYoutubeVideoResults(youtubePayload, 10),
            },
          });
        },
      );

      const normalized = serpBundle.articles;
      const youtubeSerpPayload = serpBundle.youtubeSerpPayload;

      if (normalized.length === 0) {
        throw new Error("No articles returned from Serp normalization");
      }

      const researchPrompt = buildResearchPrompt({
        date: input.date,
        location,
        scope,
      });

      pipelineLog("step", "entering parallel research branches");
      const [
        { youtubeTranscripts, youtubeAnalyses, youtubeSynthesis },
        { researched },
      ] = await Promise.all([
        (async () => {
          pipelineLog("step", "entering select-youtube-videos");
          const youtubeSelection = await step.run(
            "select-youtube-videos",
            async () => {
              pipelineLog("select-youtube-videos", "start");
              const selection = await selectYoutubeVideosForNewsResearch({
                prompt: researchPrompt,
                youtubeSerpPayload,
                abortSignal: AbortSignal.timeout(120_000),
              });
              pipelineLog("select-youtube-videos", "done", {
                candidateCount: selection.candidateCount,
                selectedCount: selection.selectedVideos.length,
              });
              return toJsonSafeStepOutput(selection);
            },
          );

          pipelineLog("step", "entering fetch-youtube-transcripts");
          const youtubeTranscripts = await step.run(
            "fetch-youtube-transcripts",
            async () => {
              const videoIds = youtubeSelection.selectedVideos.map(
                (row) => row.videoId,
              );
              pipelineLog("fetch-youtube-transcripts", "start", {
                videoIds,
              });
              const rows = await fetchYoutubeTranscriptsByVideoIds(videoIds);
              pipelineLog("fetch-youtube-transcripts", "done", {
                fetched: rows.length,
                withTranscript: rows.filter((row) => row.transcript).length,
              });
              return toJsonSafeStepOutput(
                rows.map(({ videoId, title, language, transcript }) => ({
                  videoId,
                  title,
                  language,
                  transcript,
                })),
              );
            },
          );

          pipelineLog("step", "entering analyze-youtube-transcripts");
          const youtubeAnalyses = await step.run(
            "analyze-youtube-transcripts",
            async () => {
              pipelineLog("analyze-youtube-transcripts", "start", {
                rows: youtubeTranscripts.length,
              });
              const analyses = await analyzeYoutubeTranscriptsInParallel({
                prompt: researchPrompt,
                transcripts: youtubeTranscripts.map((row) => ({
                  videoId: row.videoId,
                  title: row.title,
                  language: row.language,
                  transcript: row.transcript,
                  raw: null,
                })),
                abortSignal: AbortSignal.timeout(600_000),
              });
              pipelineLog("analyze-youtube-transcripts", "done", {
                analyzed: analyses.length,
              });
              return toJsonSafeStepOutput(analyses);
            },
          );

          pipelineLog("step", "entering synthesize-youtube-transcript-facts");
          const youtubeSynthesis = await step.run(
            "synthesize-youtube-transcript-facts",
            async () => {
              if (youtubeAnalyses.length === 0) {
                return toJsonSafeStepOutput({
                  facts: [],
                  overview: "No YouTube analyses available.",
                });
              }
              pipelineLog("synthesize-youtube-transcript-facts", "start", {
                videos: youtubeAnalyses.length,
              });
              const result = await runYoutubeTranscriptSynthesizeAgent({
                prompt: researchPrompt,
                analyses: youtubeAnalyses.map((row) => ({
                  videoId: row.videoId,
                  title: row.title,
                  analysis: youtubeTranscriptAnalysisSchema.parse(row.analysis),
                })),
                abortSignal: AbortSignal.timeout(300_000),
              });
              pipelineLog("synthesize-youtube-transcript-facts", "done", {
                factCount: result.facts.length,
              });
              return toJsonSafeStepOutput({
                facts: result.facts,
                overview: result.overview,
              });
            },
          );

          return { youtubeTranscripts, youtubeAnalyses, youtubeSynthesis };
        })(),
        (async () => {
          pipelineLog("step", "entering select-articles");
          const selected = await step.run("select-articles", async () => {
            const candidates = excludeTradingRecommendationArticles(
              normalized.slice(0, 12),
            );
            pipelineLog("select-articles", "start", {
              candidateCount: candidates.length,
            });
            const links = candidates.map((article) => ({
              url: article.url,
              title: article.title,
              snippet: article.snippet,
              source: article.source,
              sourceType: article.sourceType,
              selectionWeight: article.selectionWeight,
              fromAiOverviewFollowUp: article.fromAiOverviewFollowUp,
            }));

            const result = (
              await runResearchArticleSelectorAgent({
                userPrompt: researchPrompt,
                links,
                topPercent: 80,
                abortSignal: AbortSignal.timeout(180_000),
              })
            ).filter(
              (article) =>
                !isTradingRecommendationArticle({ title: article.title }),
            );

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
              const scrapedMarkdown = await scrapeUrlsWithFirecrawl(
                selected.map((article) => article.url),
              );

              const cleanedRows = await Promise.all(
                selected.map(async (article, index) => {
                  pipelineLog("scrape-selected-articles", "processing", {
                    index: index + 1,
                    total: selected.length,
                    url: article.url,
                  });
                  const normalizedMatch = normalized.find(
                    (row) => row.url === article.url,
                  );
                  const rawScrape = scrapedMarkdown[index]?.trim() ?? "";

                  if (!rawScrape) {
                    pipelineLog("scrape-selected-articles", "skip empty scrape", {
                      url: article.url,
                    });
                    return null;
                  }

                  if (
                    isTradingRecommendationArticle({
                      title: article.title,
                      scrapedContent: rawScrape,
                    })
                  ) {
                    pipelineLog(
                      "scrape-selected-articles",
                      "skip trading recommendation",
                      { url: article.url },
                    );
                    return null;
                  }

                  pipelineLog("scrape-selected-articles", "cleaning content", {
                    url: article.url,
                  });
                  const cleaned = await runNewsContentCleanerAgent({
                    location,
                    date: input.date,
                    content: rawScrape,
                    abortSignal: AbortSignal.timeout(180_000),
                  });

                  if (
                    !cleaned.isValidArticle ||
                    !cleaned.cleanedContent.trim()
                  ) {
                    pipelineLog(
                      "scrape-selected-articles",
                      "skip invalid article after clean",
                      { url: article.url },
                    );
                    return null;
                  }

                  return {
                    index: normalizedMatch?.index ?? index,
                    url: article.url,
                    domain: article.domain,
                    title: article.title,
                    sourceType: article.sourceType,
                    scrapedContent: cleaned.cleanedContent,
                    publishedAt: normalizedMatch?.publishedAt
                      ? new Date(normalizedMatch.publishedAt)
                      : null,
                    isPrimaryStorySource: true,
                  };
                }),
              );

              const articles = cleanedRows.filter(
                (row): row is NonNullable<(typeof cleanedRows)[number]> =>
                  row != null,
              );
              pipelineLog("scrape-selected-articles", "done", {
                scrapedCount: articles.length,
                withContent: articles.filter((a) => a.scrapedContent).length,
              });
              return toJsonSafeStepOutput(articles);
            },
          );

          return { researched };
        })(),
      ]);

      pipelineLog("step", "entering synthesize-stories");
      const synthesized = await step.run("synthesize-stories", async () => {
        const synthesizerModel = resolveNewsSynthesizerModel();
        pipelineLog("synthesize-stories", "start", {
          articleCount: researched.length,
          youtubeFactCount: youtubeSynthesis.facts.length,
          model: synthesizerModel,
        });
        const youtubeArticles = buildYoutubeArticlesForSynthesizer({
          transcripts: youtubeTranscripts,
          synthesis: youtubeSynthesis,
        });
        const stories = await runNewsSynthesizerAgent({
          newsRequestId: newsRequest.id,
          location,
          articles: [...researched, ...youtubeArticles],
          youtubeTranscriptSynthesis: youtubeSynthesis,
          userPrompt: researchPrompt,
          model: synthesizerModel,
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
        const transcriptByVideoId = new Map(
          youtubeTranscripts.map((row) => [row.videoId, row.transcript]),
        );
        for (const story of synthesized) {
          if (!storyHasPrimaryArticleSource(story)) {
            pipelineLog("persist-stories-and-sources", "skip story without primary article source", {
              title: story.title,
              sourceCount: story.sources.length,
            });
            continue;
          }

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
            const videoIdMatch = /[?&]v=([^&]+)/.exec(source.url);
            const videoId = videoIdMatch?.[1];
            const transcriptFromYoutube =
              (videoId && transcriptByVideoId.get(videoId)) ||
              source.transcript ||
              null;

            const savedSource = await createNewsSource({
              newsStoryId: savedStory.id,
              url: source.url,
              domain: source.domain,
              title: source.title,
              scrapedContent: source.scrapedContent,
              publishedAt: source.publishedAt,
              sourceType: source.sourceType,
              transcript: transcriptFromYoutube,
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
      pipelineLog("run", "finished", {
        newsRequestId: newsRequest.id,
        youtubeAnalysisCount: youtubeAnalyses.length,
      });
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
