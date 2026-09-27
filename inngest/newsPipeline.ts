/**
 * News generation pipeline (Inngest)
 *
 * Event: `news/pipeline.requested`
 *
 * Event data (`newsPipelineEventDataSchema`):
 * - `userId` — app user (Clerk-backed row in `users`)
 * - `newsRequestId` — `NewsRequest` UUID to fulfill
 * - Generation fields: `date`, `scope` (`local` | `world` | `both`), `location`,
 *   `categories`, `customQuery`, `storyCount`, `language`, `sources`, `serpHl`
 *
 * The handler also loads the persisted `NewsRequest` and builds
 * `NewsGenerationConfig` via `newsGenerationConfigFromNewsRequest`. User-facing
 * progress lines are appended to `NewsRequest.loadingLogs` during the run.
 *
 * Purpose:
 * Fulfill a configured stock-market / economic news request. Search (Google News,
 * Google web news tab, YouTube), optionally expand web news via AI Overview
 * follow-up Serp; select and scrape articles; optionally analyze YouTube
 * transcripts as supporting evidence; cluster into up to `storyCount` ranked
 * `NewsStory` rows with `NewsSource` children; set request `success` or `failed`.
 *
 * Shared prompt:
 * `buildArticleSelectionPrompt(config)` drives article selection, YouTube video
 * selection, transcript analysis, transcript fact synthesis, and synthesizer
 * context (with `targetStoryCount` on the synthesizer agent).
 *
 * Search planning:
 * `buildNewsSearchExecutionPlans(config)` — one or two tiers (`local` / `world`
 * when `scope` is `both`). Each tier supplies Serp params (combined category +
 * custom query + optional `site:` filters; local Google search uses Serp
 * `location` + `gl`/`hl`). Result volume scales with `storyCount`
 * (`serpResultsPerEngine`, `articleCandidateBudget`, `maxArticlesToScrape`).
 *
 * ── Happy-path steps ───────────────────────────────────────────────────────
 *
 * 1. load-news-request
 *    Load `NewsRequest` for `userId` + `newsRequestId`; append loading log
 *    “Pipeline started.”
 *
 * 2. plan-search-queries
 *    `buildNewsSearchExecutionPlans` → `executionPlans` (news/search queries +
 *    `googleNewsParams`, `googleSearchParams`, `youtubeParams` per tier).
 *
 * 3. save-search-queries
 *    Persist primary queries and `planPairs` (tier + news/search strings) on
 *    `NewsRequest.searchQuery`; append “Search queries planned.”
 *
 * 4. fetch-and-normalize-serp
 *    For each execution plan, parallel Serp: Google News, Google (`tbm: nws`),
 *    YouTube; merge payloads across tiers.
 *    If merged Google search has `ai_overview`, run
 *    `runGaiOverviewSearchGeneratorAgent`, fetch extra `searchGoogle` (news tab)
 *    per generated query (shared `num`, `gl`, `hl`, local `location` when set),
 *    and append into the search payload.
 *    Normalize → date window filter → drop trading-tip articles → apply
 *    selection-weight boost (1.3) for URLs found only on AI-overview follow-up.
 *    Append “Finding relevant stories.”
 *    Output: `{ articles, youtubeSerpPayload }` (≤10 video rows).
 *
 * 5–8. YouTube branch (parallel with article branch after step 4)
 *    select-youtube-videos → fetch-youtube-transcripts → analyze-youtube-transcripts
 *    → synthesize-youtube-transcript-facts.
 *
 * 9–10. Article branch (parallel with YouTube branch after step 4)
 *    select-articles — prefer configured source domains, cap candidates with
 *    `articleCandidateBudget`, `runResearchArticleSelectorAgent`, cap scrapes with
 *    `maxArticlesToScrape`.
 *    scrape-selected-articles — Firecrawl, then `runNewsContentCleanerAgent`
 *    per page; drop empty/invalid/trading-tip scrapes; append “Checking sources.”
 *
 * 11. synthesize-stories (after both branches)
 *     Append “Organizing the news.”
 *     `runNewsSynthesizerAgent` on cleaned Firecrawl articles plus YouTube rows
 *     from `buildYoutubeArticlesForSynthesizer`. YouTube is supporting evidence
 *     only (stories require primary article sources). Up to `storyCount` stories;
 *     location inferred from article content, not defaulted to request location.
 *     Model: `NEWS_SYNTHESIZER_MODEL` or `gpt-5.4-mini`.
 *
 * 12. persist-stories-and-sources
 *     Append “Preparing your briefing.”
 *     Create `NewsStory` + `NewsSource` rows (`status=READY`, `creator/provenance=
 *     SYSTEM`, `newsRequestId` set); skip synthesized stories without a primary
 *     article source; patch `newsSourceIds`; attach YouTube transcripts on sources.
 *
 * 13. mark-request-success
 *     `NewsRequest.status = success`, `completedAt` set, `error` cleared.
 *
 * 14. create-completion-notification
 *     Idempotent notification linking to the news request / briefing UI.
 *
 * 15. load-stories
 *     Reload persisted stories from DB (function return value).
 *
 * ── Failure path ─────────────────────────────────────────────────────────────
 *
 * mark-request-failed — On thrown error in try: set request `failed`, store message,
 * set `completedAt`, rethrow for Inngest retries.
 *
 * onFailure → create-failure-notification (news briefing failed; dedupe by request id).
 *
 * Timeout: 45 minutes (`timeouts.finish`).
 *
 * Chat-origin stories (`chatSessionId`, PENDING → READY) are handled by
 * `chat/story.research.requested`, not this pipeline.
 */

import { runGaiOverviewSearchGeneratorAgent } from "@/Agents/news/GAIOverviewSearchGeneratorAgents";
import { runNewsContentCleanerAgent } from "@/Agents/news/NewsContentCleanerAgent";
import {
  runNewsSynthesizerAgent,
  storyHasPrimaryArticleSource,
} from "@/Agents/news/NewsSythesizeragent";
import { runResearchArticleSelectorAgent } from "@/Agents/news/ResearchArticleSelectorAgent";
import { inngest } from "@/clients/inngestClient";
import {
  appendNewsRequestLoadingLog,
  getNewsRequestByIdForUser,
  patchNewsRequest,
} from "@/repositories/newsRequest";
import {
  newsGenerationConfigFromNewsRequest,
  newsGenerationConfigSchema,
  newsPipelineGenerationEventSchema,
} from "@/services/news/newsGenerationRequest";
import {
  articleCandidateBudget,
  buildArticleSelectionPrompt,
  buildNewsSearchExecutionPlans,
  maxArticlesToScrape,
  preferArticlesFromSources,
  serpResultsPerEngine,
} from "@/services/news/newsSearchPlanning";
import { createNewsSource } from "@/repositories/newsSource";
import {
  createNewsStory,
  listNewsStoriesByNewsRequestId,
  patchNewsStory,
} from "@/repositories/newsStory";
import { serpEngines } from "@/SERP/index";
import {
  resolveArticleImageUrl,
  resolveNewsStoryImageUrl,
} from "@/services/news/articleImageUrl";
import { scrapeUrlsWithFirecrawlRaw } from "@/services/firecrawl/scrapeUrls";
import { canonicalResearchUrl } from "@/services/chat/normalizeSerpResults";
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
  mergeSerpPayloads,
  normalizeSerpArticles,
  serpPayloadHasAiOverview,
  slimSerpPayloadForNormalize,
  toJsonSafeStepOutput,
  wrapAiOverviewFollowUpSerpPayload,
} from "@/services/news/normalizeArticles";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import {
  newsPipelineCompletedNotification,
  newsPipelineFailedNotification,
  tryCreatePipelineNotification,
} from "@/services/notifications/pipelineNotifications";
import { z } from "zod";

export const NEWS_PIPELINE_EVENT = "news/pipeline.requested" as const;

export const newsPipelineEventDataSchema = z
  .object({
    userId: z.string().min(1),
    newsRequestId: z.uuid(),
  })
  .merge(newsPipelineGenerationEventSchema);

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

export const newsPipelineFunction = inngest.createFunction(
  {
    id: "news-pipeline",
    name: "News pipeline",
    triggers: [{ event: NEWS_PIPELINE_EVENT }],
    timeouts: { finish: "45m" },
    onFailure: async ({ event, error, step }) => {
      const input = newsPipelineEventDataSchema.safeParse(event.data);
      if (!input.success) {
        pipelineLog("create-failure-notification", "skipped invalid event data");
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      pipelineLog("create-failure-notification", "start", { error: message });
      await step.run("create-failure-notification", async () => {
        await tryCreatePipelineNotification(
          newsPipelineFailedNotification({
            userId: input.data.userId,
            newsRequestId: input.data.newsRequestId,
          }),
          { newsRequestId: input.data.newsRequestId },
        );
      });
    },
  },
  async ({ event, step }) => {
    const input = newsPipelineEventDataSchema.parse(event.data);

    pipelineLog("step", "entering load-news-request");
    const loaded = await step.run("load-news-request", async () => {
      pipelineLog("load-news-request", "start");
      const row = await getNewsRequestByIdForUser(
        input.newsRequestId,
        input.userId,
      );
      if (!row) {
        throw new Error("News request not found for user");
      }
      const config = newsGenerationConfigFromNewsRequest(row);
      await appendNewsRequestLoadingLog(row.id, "Pipeline started.");
      pipelineLog("load-news-request", "done", {
        id: row.id,
        scope: config.scope,
      });
      return toJsonSafeStepOutput({ id: row.id, config });
    });

    const newsRequest = { id: loaded.id as string };
    const config = newsGenerationConfigSchema.parse(loaded.config);

    pipelineLog("run", "started", {
      newsRequestId: input.newsRequestId,
      date: config.date,
      scope: config.scope,
      location: config.location,
      storyCount: config.storyCount,
    });

    try {
      pipelineLog("step", "entering plan-search-queries");
      const plans = await step.run("plan-search-queries", async () => {
        pipelineLog("plan-search-queries", "start");
        const executionPlans = buildNewsSearchExecutionPlans(config);
        const primary = executionPlans[0]!;
        pipelineLog("plan-search-queries", "done", {
          pairCount: executionPlans.length,
          newsQuery: primary.news.query,
          searchQuery: primary.search.query,
          categories: config.categories,
          storyCount: config.storyCount,
        });
        return {
          executionPlans,
          news: primary.news,
          search: primary.search,
        };
      });

      pipelineLog("step", "entering save-search-queries");
      await step.run("save-search-queries", async () => {
        pipelineLog("save-search-queries", "start");
        await patchNewsRequest(newsRequest.id, {
          searchQuery: {
            news: plans.news.query,
            search: plans.search.query,
            planPairs: plans.executionPlans.map((pair) => ({
              tier: pair.tier,
              news: pair.news.query,
              search: pair.search.query,
            })),
          },
        });
        await appendNewsRequestLoadingLog(
          newsRequest.id,
          "Search queries planned.",
        );
        pipelineLog("save-search-queries", "done");
      });

      pipelineLog("step", "entering fetch-and-normalize-serp");
      const serpBundle = await step.run(
        "fetch-and-normalize-serp",
        async () => {
          pipelineLog("fetch-and-normalize-serp", "start");
          let googleNewsPayload: unknown = {};
          let googleSearchPayload: unknown = {};
          let youtubePayload: unknown = {};

          const serpNum = serpResultsPerEngine(config.storyCount);

          for (const plan of plans.executionPlans) {
            const [newsPayload, searchPayload, ytPayload] = await Promise.all([
              serpEngines.searchGoogleNews.fn({
                ...plan.googleNewsParams,
                num: serpNum,
              }),
              serpEngines.searchGoogle.fn({
                ...plan.googleSearchParams,
                num: serpNum,
                trigger_ai_overview: true,
              }),
              serpEngines.searchYoutube.fn(plan.youtubeParams),
            ]);
            googleNewsPayload = mergeSerpPayloads(
              googleNewsPayload,
              newsPayload,
            );
            googleSearchPayload = mergeSerpPayloads(
              googleSearchPayload,
              searchPayload,
            );
            youtubePayload = mergeSerpPayloads(youtubePayload, ytPayload);
          }

          let mergedGoogleSearchPayload: unknown = googleSearchPayload;
          let followUpPayloads: unknown[] = [];
          const primaryPlan = plans.executionPlans[0]!;
          const primaryGl = plans.news.suggestedGl ?? plans.search.suggestedGl;
          const serpShared = {
            num: serpNum,
            ...(primaryGl ? { gl: primaryGl } : {}),
            hl: plans.news.suggestedHl ?? config.serpHl,
            ...(primaryPlan.googleSearchParams.location
              ? { location: primaryPlan.googleSearchParams.location }
              : {}),
          };

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
                date: config.date,
                location: config.location ?? undefined,
                scope: config.scope === "both" ? "world" : config.scope,
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
                      ...serpShared,
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

          const limitPerEngine = serpResultsPerEngine(config.storyCount);
          const articles = normalizeSerpArticles({
            googleNewsPayload: slimSerpPayloadForNormalize(googleNewsPayload),
            googleSearchPayload: slimSerpPayloadForNormalize(
              mergedGoogleSearchPayload,
            ),
            limitPerEngine,
          });

          const filtered = filterArticlesNearRequestDate(articles, config.date);
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
            youtubeVideoCount:
              extractTopYoutubeVideoResults(youtubePayload).length,
          });
          await appendNewsRequestLoadingLog(
            newsRequest.id,
            "Finding relevant stories.",
          );
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

      const researchPrompt = buildArticleSelectionPrompt(config);
      const candidateBudget = articleCandidateBudget(config.storyCount);
      const scrapeBudget = maxArticlesToScrape(config.storyCount);

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
            const budgeted = preferArticlesFromSources(
              excludeTradingRecommendationArticles(normalized),
              config.sources,
            ).slice(0, candidateBudget);
            pipelineLog("select-articles", "start", {
              candidateCount: budgeted.length,
              candidateBudget,
              scrapeBudget,
            });
            const candidates = budgeted;
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
            )
              .filter(
                (article) =>
                  !isTradingRecommendationArticle({ title: article.title }),
              )
              .slice(0, scrapeBudget);

            pipelineLog("select-articles", "done", {
              selectedCount: result.length,
              scrapeBudget,
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
              const scrapedBundles = await scrapeUrlsWithFirecrawlRaw(
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
                  const scrapeBundle = scrapedBundles[index];
                  const rawScrape = scrapeBundle?.markdown?.trim() ?? "";

                  if (!rawScrape) {
                    pipelineLog(
                      "scrape-selected-articles",
                      "skip empty scrape",
                      {
                        url: article.url,
                      },
                    );
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
                    location: config.location,
                    date: config.date,
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

                  const imageUrl = resolveArticleImageUrl({
                    firecrawlPayload: scrapeBundle?.raw,
                    serpImageUrl: normalizedMatch?.imageUrl ?? null,
                  });

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
                    imageUrl,
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
              await appendNewsRequestLoadingLog(
                newsRequest.id,
                "Checking sources.",
              );
              return toJsonSafeStepOutput(articles);
            },
          );

          return { researched };
        })(),
      ]);

      pipelineLog("step", "entering synthesize-stories");
      const synthesized = await step.run("synthesize-stories", async () => {
        await appendNewsRequestLoadingLog(
          newsRequest.id,
          "Organizing the news.",
        );
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
          location: config.location,
          articles: [...researched, ...youtubeArticles],
          youtubeTranscriptSynthesis: youtubeSynthesis,
          userPrompt: `${researchPrompt}\n\nReturn at most ${config.storyCount} distinct stories backed by primary article sources. Do not pad with low-quality pages.`,
          targetStoryCount: config.storyCount,
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
        await appendNewsRequestLoadingLog(
          newsRequest.id,
          "Preparing your briefing.",
        );
        pipelineLog("persist-stories-and-sources", "start", {
          storyCount: synthesized.length,
        });
        const transcriptByVideoId = new Map(
          youtubeTranscripts.map((row) => [row.videoId, row.transcript]),
        );
        const imageByUrl = new Map<string, string | null>();
        for (const article of researched) {
          const key = canonicalResearchUrl(article.url);
          if (key) {
            imageByUrl.set(key, article.imageUrl ?? null);
          }
        }
        for (const story of synthesized) {
          if (!storyHasPrimaryArticleSource(story)) {
            pipelineLog(
              "persist-stories-and-sources",
              "skip story without primary article source",
              {
                title: story.title,
                sourceCount: story.sources.length,
              },
            );
            continue;
          }

          const storyImageUrl = resolveNewsStoryImageUrl({
            sources: story.sources,
            imageByUrl,
          });

          const savedStory = await createNewsStory({
            newsRequestId: newsRequest.id,
            status: "READY",
            creator: "SYSTEM",
            provenance: "SYSTEM",
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
            imageUrl: storyImageUrl,
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

      await step.run("create-completion-notification", async () => {
        pipelineLog("create-completion-notification", "start");
        await tryCreatePipelineNotification(
          newsPipelineCompletedNotification({
            userId: input.userId,
            newsRequestId: newsRequest.id,
          }),
          { newsRequestId: newsRequest.id },
        );
        pipelineLog("create-completion-notification", "done");
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
