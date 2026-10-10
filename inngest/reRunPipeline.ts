/**
 * Incremental news rerun pipeline (Inngest) — refresh an existing system briefing
 *
 * Event: `news/pipeline.rerun.requested`
 *
 * Event data (`newsRerunPipelineEventDataSchema`):
 * - `newsId` — `NewsRequest` UUID (same id as the fulfilled briefing)
 *
 * Trigger:
 * - User/API sets `NewsRequest.isRerunning = true`, then `enqueueNewsRerunPipeline(newsId)`.
 * - Complements but does **not** replace the initial `news/pipeline.requested` run in
 *   `newsPipeline.ts` (no second request row; mutates existing `NewsStory` / `NewsSource`).
 *
 * Function id: `news-rerun-pipeline`
 * Timeout: 45 minutes (`timeouts.finish`)
 * Concurrency: `{ limit: 1, key: "event.data.newsId" }` — at most one rerun per briefing.
 *
 * Purpose:
 * Discover **new** web/YouTube evidence since the last successful completion, attach sources
 * that were missed before, and optionally rewrite existing stories or add net-new stories when
 * material developments appear. Leaves the request `status` as-is (typically still `success`).
 *
 * Config:
 * - Reloads generation fields from the persisted `NewsRequest` via
 *   `newsGenerationConfigFromNewsRequest`.
 * - Rebuilds `NewsGenerationConfig` from the persisted row (`date`, `location`, optional
 *   `latitude`/`longitude` columns, categories, custom query, story count, language, sources).
 *   Serp date window uses the row’s briefing **`date`**, not “today”.
 *
 * Known-source dedupe (incremental semantics):
 * - `load-previous-context` — existing stories, per-story scraped articles, canonical URL keys,
 *   known YouTube video ids, and `boundaryIso` (time window for “new since last run”).
 * - `fetch-and-normalize-serp` — Serp discovery in `mode: { kind: "rerun", boundary }`; then
 *   `partitionNewNormalizedArticles` drops URLs already on the briefing.
 * - YouTube branch skips videos in `knownYoutubeVideoIds`.
 *
 * Shared search/scrape helpers with `newsPipeline.ts`:
 * - `planNewsSearchExecution`, `fetchAndNormalizeNewsSerpDiscovery`
 * - `buildArticleSelectionPrompt`, `articleCandidateBudget`, `maxArticlesToScrape`
 * - Firecrawl scrape + `runNewsContentCleanerAgent`
 * - YouTube: `selectYoutubeVideosForNewsResearch`, transcript fetch/analyze,
 *   `runYoutubeTranscriptSynthesizeAgent`, `buildYoutubeArticlesForSynthesizer`
 *
 * Agents (see `Agents/news/*` headers for model env vars):
 * - `ResearchArticleSelectorAgent` — rank new Serp links for scrape
 * - `NewsContentCleanerAgent` — Firecrawl markdown → article body
 * - `YoutubeVideoAgent` / `YoutubeTranscriptAgent` / `YoutubeTranscriptSynthesizeAgent` — supporting evidence
 * - `StoryMatcherAgent` — map new evidence → existing story ids or new-topic candidates
 * - `StoryUpdateDecisionAgent` — per matched story, decide full rewrite vs attach-only
 * - `NewsSynthesizerAgent` — single-story updates (`fixedStoryId`) and net-new stories
 *
 * ── Happy-path steps ───────────────────────────────────────────────────────
 *
 * 1. load-news-request
 *    Load row by `newsId`; skip entire run when `isRerunning` is false. Else return owner,
 *    timestamps, and serialized request payload for config rebuild.
 *
 * 2. reset-rerun-loading-logs
 *    Replace `NewsRequest.loadingLogs` with rerun-specific progress copy (UI wait panel).
 *
 * 3. load-previous-context
 *    Append “Finding new developments.” Build rerun snapshot: stories, sources by story id,
 *    known URL/video index, Serp date boundary.
 *
 * 4. plan-search-queries
 *    `planNewsSearchExecution(config)` — same tiered plans as initial news pipeline.
 *
 * 5. fetch-and-normalize-serp
 *    Append “Checking new sources.” Run Serp per plan with rerun boundary filter; dedupe against
 *    known URLs; pass through YouTube payload (≤10 videos). Tracks `skippedKnown` count.
 *
 * 6. research-new-evidence (single consolidated step — articles + YouTube)
 *    - Articles: selector → Firecrawl → cleaner; primary story sources (`isPrimaryStorySource`).
 *    - YouTube: select → transcripts → parallel analyze → synthesize facts; supporting only.
 *    Output: `researched`, `youtubeEvidence`, `youtubeArticles`, `youtubeSynthesis`, counts.
 *
 * 7. complete-no-new-evidence (branch when article + YouTube evidence count is 0)
 *    Append refresh copy, clear `isRerunning`, notify “no new sources”, return empty result.
 *
 * 8. story-match
 *    Append “Comparing with existing stories.” Build evidence cards (800-char excerpts).
 *    `runStoryMatcherAgent` → `{ matches[], newStoryCandidates[] }`. If no existing stories,
 *    all evidence becomes one new candidate bucket.
 *
 * 9. apply-rerun-outcomes
 *    Append “Updating stories.” For each match:
 *    - `runStoryUpdateDecisionAgent` — if `shouldUpdate`, re-synthesize with combined articles +
 *      YouTube synthesis input and patch story + new `NewsSource` rows; else attach sources only.
 *    Re-run matcher on new-story candidates when needed to avoid duplicates; synthesize net-new
 *    stories with primary article requirement (`storyHasPrimaryArticleSource`). Returns
 *    `NewsRerunPipelineResult` (`updatedStories`, `unchangedStories`, `newStories`, `newSources`).
 *
 * 10. complete-rerun
 *     Clear `isRerunning`; idempotent `newsPipelineRerunCompletedNotification` with summary counts.
 *
 * ── Failure path ────────────────────────────────────────────────────────────
 *
 * onFailure → rerun-on-failure-reset-flag — Always clears `isRerunning`; sends rerun failed
 * notification when the request row still exists. Does not mark the original briefing `failed`.
 *
 * Return: `NewsRerunPipelineResult` (or `{ skipped: true, skipReason }` when guard skipped).
 */

import { runNewsContentCleanerAgent } from "@/Agents/news/NewsContentCleanerAgent";
import {
  runNewsSynthesizerAgent,
  storyHasPrimaryArticleSource,
  type ResearchedArticle,
} from "@/Agents/news/NewsSythesizeragent";
import { runResearchArticleSelectorAgent } from "@/Agents/news/ResearchArticleSelectorAgent";
import { runStoryMatcherAgent } from "@/Agents/news/StoryMatcherAgent";
import { runStoryUpdateDecisionAgent } from "@/Agents/news/StoryUpdateDecisionAgent";
import { runYoutubeTranscriptSynthesizeAgent } from "@/Agents/news/YoutubeTranscriptSyntesizeAgent";
import { youtubeTranscriptAnalysisSchema } from "@/Agents/news/YoutubeTranscriptAgent";
import { createPipelineLogger } from "@/clients/pipelineLogger";
import { inngest } from "@/clients/inngestClient";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import {
  appendNewsRequestLoadingLog,
  getNewsRequestById,
  patchNewsRequest,
  setNewsRequestIsRerunning,
} from "@/repositories/newsRequest";
import { createNewsSource } from "@/repositories/newsSource";
import {
  createNewsStory,
  getNewsStoryById,
  patchNewsStory,
} from "@/repositories/newsStory";
import { canonicalResearchUrl } from "@/services/chat/normalizeSerpResults";
import {
  newsGenerationConfigFromNewsRequest,
  newsGenerationConfigSchema,
  type NewsGenerationConfig,
} from "@/services/news/newsGenerationRequest";
import {
  hydrateKnownSourceIndex,
  loadNewsRerunPreviousContext,
} from "@/services/news/newsRerunContext";
import {
  articleResourceId,
  youtubeResourceId,
  youtubeResourceIdFromUrl,
} from "@/services/news/newsRerunEvidenceIds";
import { shouldRunNewsRerunPipeline } from "@/services/news/newsRerunGuard";
import {
  isKnownYoutubeVideo,
  partitionNewNormalizedArticles,
} from "@/services/news/newsRerunKnownSources";
import type { NewsRerunPipelineResult } from "@/services/news/newsRerunTypes";
import {
  fetchAndNormalizeNewsSerpDiscovery,
  planNewsSearchExecution,
} from "@/services/news/newsSerpDiscovery";
import {
  articleCandidateBudget,
  buildArticleSelectionPrompt,
  maxArticlesToScrape,
  preferArticlesFromSources,
} from "@/services/news/newsSearchPlanning";
import {
  excludeTradingRecommendationArticles,
  isTradingRecommendationArticle,
  toJsonSafeStepOutput,
} from "@/services/news/normalizeArticles";
import {
  resolveArticleImageUrl,
  resolveNewsStoryImageUrl,
} from "@/services/news/articleImageUrl";
import { scrapeUrlsWithFirecrawlRaw } from "@/services/firecrawl/scrapeUrls";
import {
  analyzeYoutubeTranscriptsInParallel,
  buildYoutubeArticlesForSynthesizer,
  fetchYoutubeTranscriptsByVideoIds,
  selectYoutubeVideosForNewsResearch,
} from "@/services/news/youtubeResearch";
import {
  newsPipelineRerunCompletedNotification,
  newsPipelineRerunFailedNotification,
  tryCreatePipelineNotification,
} from "@/services/notifications/pipelineNotifications";
import { z } from "zod";

function youtubeVideoIdFromSerpRow(row: {
  video_id?: string;
  link?: string;
}): string | null {
  const direct = row.video_id?.trim();
  if (direct) {
    return direct;
  }
  const link = row.link?.trim();
  if (!link) {
    return null;
  }
  try {
    const parsed = new URL(link);
    const fromQuery = parsed.searchParams.get("v")?.trim();
    if (fromQuery) {
      return fromQuery;
    }
  } catch {
    return null;
  }
  return null;
}

export const NEWS_RERUN_PIPELINE_EVENT =
  "news/pipeline.rerun.requested" as const;

export const newsRerunPipelineEventDataSchema = z.object({
  newsId: z.uuid(),
});

export type NewsRerunPipelineEventData = z.infer<
  typeof newsRerunPipelineEventDataSchema
>;

const PIPELINE_LOG_PREFIX = "[news-rerun-pipeline]";
const pipelineLog = createPipelineLogger(PIPELINE_LOG_PREFIX);

const RERUN_LOADING_LOG_RESET = ["Refreshing your briefing."];

const DEFAULT_NEWS_SYNTHESIZER_MODEL = "gpt-5.4-mini";

function youtubeSynthesisInput(
  synthesis: unknown,
): Pick<
  Parameters<typeof runNewsSynthesizerAgent>[0],
  "youtubeTranscriptSynthesis"
> {
  const row = synthesis as {
    facts?: unknown[];
    overview?: string;
  };
  if (!row.facts?.length || !row.overview?.trim()) {
    return {};
  }
  return {
    youtubeTranscriptSynthesis: {
      facts: row.facts as Parameters<
        typeof runNewsSynthesizerAgent
      >[0]["youtubeTranscriptSynthesis"] extends infer T
        ? T extends { facts: infer F }
          ? F
          : never
        : never,
      overview: row.overview,
    },
  };
}

function resolveNewsSynthesizerModel(): string {
  return resolveOpenAiModelId(
    undefined,
    process.env.NEWS_SYNTHESIZER_MODEL ?? DEFAULT_NEWS_SYNTHESIZER_MODEL,
  );
}

/** Run async work in order without `await` inside a `for` loop (eslint no-await-in-loop). */
async function runSequentially<T>(
  items: readonly T[],
  run: (item: T) => Promise<void>,
): Promise<void> {
  await items.reduce(
    (chain, item) => chain.then(() => run(item)),
    Promise.resolve(),
  );
}

export function enqueueNewsRerunPipeline(newsId: string) {
  return inngest.send({
    name: NEWS_RERUN_PIPELINE_EVENT,
    data: { newsId },
  });
}

async function resetRerunFlag(newsRequestId: string) {
  await setNewsRequestIsRerunning(newsRequestId, false);
}

export const newsRerunPipelineFunction = inngest.createFunction(
  {
    id: "news-rerun-pipeline",
    name: "Incremental news rerun pipeline",
    triggers: [{ event: NEWS_RERUN_PIPELINE_EVENT }],
    timeouts: { finish: "45m" },
    concurrency: [{ limit: 1, key: "event.data.newsId" }],
    onFailure: async ({ event, error, step }) => {
      const parsed = newsRerunPipelineEventDataSchema.safeParse(event.data);
      if (!parsed.success) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      await step.run("rerun-on-failure-reset-flag", async () => {
        await resetRerunFlag(parsed.data.newsId);
        const row = await getNewsRequestById(parsed.data.newsId);
        if (row) {
          await tryCreatePipelineNotification(
            newsPipelineRerunFailedNotification({
              userId: row.userId,
              newsRequestId: row.id,
              eventId: parsed.data.newsId,
            }),
            { newsRequestId: row.id },
          );
        }
      });
      pipelineLog("onFailure", message);
    },
  },
  async ({ event, step }) => {
    const input = newsRerunPipelineEventDataSchema.parse(event.data);

    const loaded = await step.run("load-news-request", async () => {
      const row = await getNewsRequestById(input.newsId);
      if (!row) {
        throw new Error("News request not found");
      }
      if (!shouldRunNewsRerunPipeline(row.isRerunning)) {
        pipelineLog("load-news-request", "skipped — isRerunning is false");
        return toJsonSafeStepOutput({
          ok: false as const,
          skipReason: "Rerun was not requested (isRerunning is false).",
        });
      }
      return toJsonSafeStepOutput({
        ok: true as const,
        row: {
          id: row.id,
          userId: row.userId,
          status: row.status,
          completedAt: row.completedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
          request: {
            date: row.date.toISOString(),
            scope: row.scope,
            location: row.location,
            latitude: row.latitude,
            longitude: row.longitude,
            categories: row.categories,
            customQuery: row.customQuery,
            storyCount: row.storyCount,
            language: row.language,
            sources: row.sources,
            searchQuery: row.searchQuery,
          },
        },
      });
    });

    if (!loaded.ok) {
      return toJsonSafeStepOutput({
        skipped: true,
        skipReason: loaded.skipReason,
        updatedStories: [],
        unchangedStories: [],
        newStories: [],
        newSources: 0,
        skippedSources: 0,
      } satisfies NewsRerunPipelineResult);
    }

    const newsRequestId = loaded.row.id as string;
    const userId = loaded.row.userId as string;
    const requestPayload = loaded.row.request as {
      date: string;
      scope: "local" | "world" | "both";
      location: string | null;
      latitude: number | null;
      longitude: number | null;
      categories: string[];
      customQuery: string | null;
      storyCount: number;
      language: string | null;
      sources: string[];
      searchQuery: unknown;
    };
    const config = newsGenerationConfigSchema.parse(
      newsGenerationConfigFromNewsRequest({
        date: new Date(requestPayload.date),
        scope: requestPayload.scope,
        location: requestPayload.location,
        latitude: requestPayload.latitude,
        longitude: requestPayload.longitude,
        categories: requestPayload.categories,
        customQuery: requestPayload.customQuery,
        storyCount: requestPayload.storyCount,
        language: requestPayload.language,
        sources: requestPayload.sources,
        searchQuery: requestPayload.searchQuery,
      }),
    );

    await step.run("reset-rerun-loading-logs", async () => {
      await patchNewsRequest(newsRequestId, {
        loadingLogs: RERUN_LOADING_LOG_RESET,
      });
      return { ok: true as const };
    });

    const previousContext = await step.run(
      "load-previous-context",
      async () => {
        await appendNewsRequestLoadingLog(
          newsRequestId,
          "Finding new developments.",
        );
        const ctx = await loadNewsRerunPreviousContext(newsRequestId, {
          completedAt: loaded.row.completedAt
            ? new Date(loaded.row.completedAt as string)
            : null,
          createdAt: new Date(loaded.row.createdAt as string),
        });
        return toJsonSafeStepOutput(ctx);
      },
    );

    const knownSources = hydrateKnownSourceIndex({
      knownSourceUrlKeys: previousContext.knownSourceUrlKeys as string[],
      knownYoutubeVideoIds: previousContext.knownYoutubeVideoIds as string[],
    });

    const executionPlans = await step.run("plan-search-queries", async () => {
      const plans = await planNewsSearchExecution(config);
      return toJsonSafeStepOutput(plans);
    });

    const serpBundle = await step.run("fetch-and-normalize-serp", async () => {
      await appendNewsRequestLoadingLog(newsRequestId, "Checking new sources.");
      const bundle = await fetchAndNormalizeNewsSerpDiscovery({
        config,
        executionPlans,
        mode: {
          kind: "rerun",
          boundary: new Date(previousContext.boundaryIso as string),
        },
      });
      const { newArticles, skippedKnown } = partitionNewNormalizedArticles(
        bundle.articles,
        knownSources,
      );
      pipelineLog("serp", "deduped", {
        raw: bundle.articles.length,
        newArticles: newArticles.length,
        skippedKnown,
      });
      return toJsonSafeStepOutput({
        articles: newArticles,
        youtubeSerpPayload: bundle.youtubeSerpPayload,
        skippedKnown,
      });
    });

    const researchPrompt = buildArticleSelectionPrompt(config);
    const candidateBudget = articleCandidateBudget(config.storyCount);
    const scrapeBudget = maxArticlesToScrape(config.storyCount);

    const research = await step.run("research-new-evidence", async () => {
      const normalized = serpBundle.articles;
      let skippedSources = serpBundle.skippedKnown as number;
      let researched: ResearchedArticle[] = [];

      if (normalized.length > 0) {
        const budgeted = preferArticlesFromSources(
          excludeTradingRecommendationArticles(normalized),
          config.sources,
        ).slice(0, candidateBudget);

        const links = budgeted.map((article) => ({
          url: article.url,
          title: article.title,
          snippet: article.snippet,
          source: article.source,
          sourceType: article.sourceType,
          selectionWeight: article.selectionWeight,
          fromAiOverviewFollowUp: article.fromAiOverviewFollowUp,
        }));

        const selected = (
          await runResearchArticleSelectorAgent({
            userPrompt: researchPrompt,
            links,
            topPercent: 50,
            abortSignal: AbortSignal.timeout(180_000),
          })
        )
          .filter(
            (article) =>
              !isTradingRecommendationArticle({ title: article.title }),
          )
          .slice(0, scrapeBudget);

        const scrapedBundles = await scrapeUrlsWithFirecrawlRaw(
          selected.map((a) => a.url),
        );

        const cleanedRows = await Promise.all(
          selected.map(async (article, index) => {
            const normalizedMatch = normalized.find(
              (row) => row.url === article.url,
            );
            const rawScrape = scrapedBundles[index]?.markdown?.trim() ?? "";
            if (!rawScrape) {
              return null;
            }
            const cleaned = await runNewsContentCleanerAgent({
              location: config.location,
              date: config.date,
              content: rawScrape,
              abortSignal: AbortSignal.timeout(180_000),
            });
            if (!cleaned.isValidArticle || !cleaned.cleanedContent.trim()) {
              return null;
            }
            const imageUrl = resolveArticleImageUrl({
              firecrawlPayload: scrapedBundles[index]?.raw,
              serpImageUrl: normalizedMatch?.imageUrl ?? null,
            });
            return {
              resourceId: articleResourceId(article.url),
              article: {
                url: article.url,
                domain: article.domain,
                title: article.title,
                sourceType: article.sourceType,
                scrapedContent: cleaned.cleanedContent.trim(),
                publishedAt: normalizedMatch?.publishedAt
                  ? new Date(normalizedMatch.publishedAt)
                  : null,
                isPrimaryStorySource: true,
                imageUrl,
              } satisfies ResearchedArticle,
            };
          }),
        );

        researched = cleanedRows
          .filter((row): row is NonNullable<typeof row> => row != null)
          .map((row) => row.article);
      }

      let youtubeEvidence: Array<{
        resourceId: string;
        videoId: string;
        title: string;
        excerpt: string;
      }> = [];
      let youtubeArticles: ResearchedArticle[] = [];
      let youtubeSynthesis: Awaited<
        ReturnType<typeof runYoutubeTranscriptSynthesizeAgent>
      > = {
        facts: [],
        overview: "No YouTube analyses available.",
        model: "none",
      };

      const ytPayload = serpBundle.youtubeSerpPayload;
      if (ytPayload?.video_results?.length) {
        const filteredVideos = ytPayload.video_results.filter((row) => {
          const videoId = youtubeVideoIdFromSerpRow(row);
          return videoId != null && !isKnownYoutubeVideo(videoId, knownSources);
        });
        skippedSources +=
          ytPayload.video_results.length - filteredVideos.length;

        if (filteredVideos.length > 0) {
          const titleByVideoId = new Map<string, string>();
          for (const row of filteredVideos) {
            const videoId = youtubeVideoIdFromSerpRow(row);
            if (videoId) {
              titleByVideoId.set(videoId, row.title?.trim() || videoId);
            }
          }

          const selection = await selectYoutubeVideosForNewsResearch({
            prompt: researchPrompt,
            youtubeSerpPayload: { video_results: filteredVideos },
            abortSignal: AbortSignal.timeout(120_000),
          });
          const transcripts = await fetchYoutubeTranscriptsByVideoIds(
            selection.selectedVideos.map((v) => v.videoId),
          );
          const analyses = await analyzeYoutubeTranscriptsInParallel({
            prompt: researchPrompt,
            transcripts: transcripts.map((row) => ({
              videoId: row.videoId,
              title: row.title,
              language: row.language,
              transcript: row.transcript,
              raw: null,
            })),
            abortSignal: AbortSignal.timeout(600_000),
          });
          if (analyses.length > 0) {
            youtubeSynthesis = await runYoutubeTranscriptSynthesizeAgent({
              prompt: researchPrompt,
              analyses: analyses.map((row) => ({
                videoId: row.videoId,
                title: row.title,
                analysis: youtubeTranscriptAnalysisSchema.parse(row.analysis),
              })),
              abortSignal: AbortSignal.timeout(300_000),
            });
          }
          youtubeArticles = buildYoutubeArticlesForSynthesizer({
            transcripts,
            synthesis: youtubeSynthesis,
          });
          youtubeEvidence = selection.selectedVideos.map((video) => ({
            resourceId: youtubeResourceId(video.videoId),
            videoId: video.videoId,
            title: titleByVideoId.get(video.videoId) ?? video.videoId,
            excerpt: video.reason,
          }));
        }
      }

      return toJsonSafeStepOutput({
        researched,
        researchedResourceIds: researched.map((a) => articleResourceId(a.url)),
        youtubeEvidence,
        youtubeArticles,
        youtubeSynthesis,
        skippedSources,
      });
    });

    const evidenceCount =
      (research.researched as ResearchedArticle[]).length +
      (research.youtubeEvidence as unknown[]).length;

    if (evidenceCount === 0) {
      await step.run("complete-no-new-evidence", async () => {
        await appendNewsRequestLoadingLog(
          newsRequestId,
          "Your briefing has been refreshed.",
        );
        await resetRerunFlag(newsRequestId);
        await tryCreatePipelineNotification(
          newsPipelineRerunCompletedNotification({
            userId,
            newsRequestId,
            eventId: event.id,
            summary: "No new sources were found since your last briefing.",
          }),
          { newsRequestId },
        );
      });
      return toJsonSafeStepOutput({
        updatedStories: [],
        unchangedStories: [],
        newStories: [],
        newSources: 0,
        skippedSources: research.skippedSources as number,
      } satisfies NewsRerunPipelineResult);
    }

    const matchResult = await step.run("story-match", async () => {
      await appendNewsRequestLoadingLog(
        newsRequestId,
        "Comparing with existing stories.",
      );
      const newEvidence = [
        ...(research.researched as ResearchedArticle[]).map((article) => ({
          resourceId: articleResourceId(article.url),
          kind: "article" as const,
          title: article.title,
          excerpt: (article.scrapedContent ?? article.title).slice(0, 800),
          url: article.url,
        })),
        ...(
          research.youtubeEvidence as Array<{
            resourceId: string;
            title: string;
            excerpt: string;
          }>
        ).map((row) => ({
          resourceId: row.resourceId,
          kind: "youtube" as const,
          title: row.title,
          excerpt: row.excerpt.slice(0, 800),
        })),
      ];

      const existingStories = previousContext.stories as Array<{
        id: string;
        title: string;
        summary: string;
        category: string;
      }>;

      if (existingStories.length === 0) {
        return toJsonSafeStepOutput({
          matches: [],
          newStoryCandidates: [
            {
              resourceIds: newEvidence.map((e) => e.resourceId),
              topic: "New developments",
              reason: "No existing stories on this request.",
            },
          ],
        });
      }

      const matched = await runStoryMatcherAgent({
        existingStories,
        newEvidence,
        abortSignal: AbortSignal.timeout(180_000),
      });
      return toJsonSafeStepOutput(matched);
    });

    const outcome = await step.run("apply-rerun-outcomes", async () => {
      await appendNewsRequestLoadingLog(newsRequestId, "Updating stories.");
      const result: NewsRerunPipelineResult = {
        updatedStories: [],
        unchangedStories: [],
        newStories: [],
        newSources: 0,
        skippedSources: research.skippedSources as number,
      };

      const researchedByResource = new Map<string, ResearchedArticle>();
      for (const article of research.researched as ResearchedArticle[]) {
        researchedByResource.set(articleResourceId(article.url), article);
      }
      for (const article of (research.youtubeArticles ??
        []) as ResearchedArticle[]) {
        const youtubeKey = youtubeResourceIdFromUrl(article.url);
        if (youtubeKey) {
          researchedByResource.set(youtubeKey, article);
        }
        researchedByResource.set(articleResourceId(article.url), article);
      }

      const synthesizerModel = resolveNewsSynthesizerModel();
      const imageByUrl = new Map<string, string | null>();
      for (const article of research.researched as ResearchedArticle[]) {
        const key = canonicalResearchUrl(article.url);
        if (key) {
          imageByUrl.set(key, article.imageUrl ?? null);
        }
      }

      const matches = matchResult.matches as Array<{
        storyId: string;
        resourceIds: string[];
        reason: string;
      }>;

      const sourcesByStoryId = previousContext.sourcesByStoryId as Record<
        string,
        ResearchedArticle[]
      >;

      await runSequentially(matches, async (match) => {
        const story = await getNewsStoryById(match.storyId);
        if (!story) {
          return;
        }
        const existingArticles = sourcesByStoryId[match.storyId] ?? [];
        const newEvidenceArticles = match.resourceIds
          .map((id) => researchedByResource.get(id))
          .filter((row): row is ResearchedArticle => row != null);

        if (newEvidenceArticles.length === 0) {
          result.unchangedStories.push({
            storyId: story.id,
            reason:
              "Matched new sources could not be loaded; skipping story update.",
          });
          return;
        }

        const decision = await runStoryUpdateDecisionAgent({
          existingStory: {
            id: story.id,
            title: story.title,
            summary: story.summary.slice(0, 800),
            contentExcerpt: story.content.slice(0, 1200),
          },
          existingSources: existingArticles.map((source) => ({
            title: source.title,
            url: source.url,
            excerpt: (source.scrapedContent ?? source.title).slice(0, 400),
          })),
          newEvidence: newEvidenceArticles.map((source) => ({
            title: source.title,
            url: source.url,
            excerpt: (source.scrapedContent ?? source.title).slice(0, 400),
          })),
          abortSignal: AbortSignal.timeout(120_000),
        });

        if (!decision.shouldUpdate) {
          result.unchangedStories.push({
            storyId: story.id,
            reason: decision.reason,
          });
          const attached = await Promise.all(
            newEvidenceArticles.map((article) =>
              createNewsSource({
                newsStoryId: story.id,
                url: article.url,
                domain: article.domain ?? new URL(article.url).hostname,
                title: article.title,
                scrapedContent: article.scrapedContent,
                publishedAt: article.publishedAt,
                sourceType: article.sourceType,
              }),
            ),
          );
          result.newSources += attached.length;
          if (attached.length > 0) {
            await patchNewsStory(story.id, {
              newsSourceIds: [
                ...story.newsSourceIds,
                ...attached.map((row) => row.id),
              ],
            });
          }
          return;
        }

        const combinedArticles = [...existingArticles, ...newEvidenceArticles];
        const synthesized = await runNewsSynthesizerAgent({
          newsRequestId,
          location: config.location,
          articles: combinedArticles,
          ...youtubeSynthesisInput(research.youtubeSynthesis),
          userPrompt: `${researchPrompt}\n\nUpdate the existing story with new evidence while preserving prior context.`,
          targetStoryCount: 1,
          fixedStoryId: story.id,
          model: synthesizerModel,
          abortSignal: AbortSignal.timeout(300_000),
        });

        const updated = synthesized[0];
        if (!updated || !storyHasPrimaryArticleSource(updated)) {
          result.unchangedStories.push({
            storyId: story.id,
            reason: "Synthesizer did not produce an updatable story.",
          });
          return;
        }

        const storyImageUrl = resolveNewsStoryImageUrl({
          sources: updated.sources,
          imageByUrl,
        });

        await patchNewsStory(story.id, {
          title: updated.title,
          description: updated.description,
          summary: updated.summary,
          content: updated.content,
          category: updated.category,
          location: updated.location,
          publishedAt: updated.publishedAt,
          importanceScore: updated.importanceScore,
          imageUrl: storyImageUrl ?? story.imageUrl,
        });

        const existingUrlKeys = new Set(
          existingArticles
            .map((a) => canonicalResearchUrl(a.url))
            .filter(Boolean),
        );
        const sourcesToCreate = updated.sources.filter((source) => {
          const key = canonicalResearchUrl(source.url);
          return !(key && existingUrlKeys.has(key));
        });
        const createdSources = await Promise.all(
          sourcesToCreate.map((source) =>
            createNewsSource({
              newsStoryId: story.id,
              url: source.url,
              domain: source.domain,
              title: source.title,
              scrapedContent: source.scrapedContent,
              publishedAt: source.publishedAt,
              sourceType: source.sourceType,
              transcript: source.transcript,
            }),
          ),
        );
        result.newSources += createdSources.length;
        if (createdSources.length > 0) {
          await patchNewsStory(story.id, {
            newsSourceIds: [
              ...story.newsSourceIds,
              ...createdSources.map((row) => row.id),
            ],
          });
        }

        result.updatedStories.push({
          storyId: story.id,
          reason: decision.reason,
        });
      });

      let candidates = matchResult.newStoryCandidates as Array<{
        resourceIds: string[];
        topic: string;
        reason: string;
      }>;

      if (
        candidates.length > 0 &&
        (previousContext.stories as unknown[]).length > 0
      ) {
        const finalCheck = await runStoryMatcherAgent({
          existingStories: previousContext.stories as Array<{
            id: string;
            title: string;
            summary: string;
            category: string;
          }>,
          newEvidence: candidates.flatMap((candidate) =>
            candidate.resourceIds.map((resourceId) => {
              const article = researchedByResource.get(resourceId);
              return {
                resourceId,
                kind: "article" as const,
                title: article?.title ?? candidate.topic,
                excerpt: candidate.reason,
                url: article?.url,
              };
            }),
          ),
          abortSignal: AbortSignal.timeout(120_000),
        });
        for (const match of finalCheck.matches) {
          candidates = candidates.filter(
            (c) => !match.resourceIds.some((id) => c.resourceIds.includes(id)),
          );
        }
      }

      await runSequentially(candidates, async (candidate) => {
        const candidateArticles = candidate.resourceIds
          .map((id) => researchedByResource.get(id))
          .filter((row): row is ResearchedArticle => row != null);
        if (!candidateArticles.some((a) => a.isPrimaryStorySource !== false)) {
          return;
        }

        const stories = await runNewsSynthesizerAgent({
          newsRequestId,
          location: config.location,
          articles: candidateArticles,
          ...youtubeSynthesisInput(research.youtubeSynthesis),
          userPrompt: `${researchPrompt}\n\nNew story topic: ${candidate.topic}`,
          targetStoryCount: 1,
          model: synthesizerModel,
          abortSignal: AbortSignal.timeout(300_000),
        });

        const story = stories[0];
        if (!story || !storyHasPrimaryArticleSource(story)) {
          return;
        }

        const storyImageUrl = resolveNewsStoryImageUrl({
          sources: story.sources,
          imageByUrl,
        });

        const savedStory = await createNewsStory({
          newsRequestId,
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
          loadingLogs: ["Story added during briefing refresh."],
        });

        const createdSources = await Promise.all(
          story.sources.map((source) =>
            createNewsSource({
              newsStoryId: savedStory.id,
              url: source.url,
              domain: source.domain,
              title: source.title,
              scrapedContent: source.scrapedContent,
              publishedAt: source.publishedAt,
              sourceType: source.sourceType,
              transcript: source.transcript,
            }),
          ),
        );
        result.newSources += createdSources.length;
        if (createdSources.length > 0) {
          await patchNewsStory(savedStory.id, {
            newsSourceIds: createdSources.map((row) => row.id),
          });
        }
        result.newStories.push({ storyId: savedStory.id });
      });

      await appendNewsRequestLoadingLog(
        newsRequestId,
        "Your briefing has been refreshed.",
      );
      return toJsonSafeStepOutput(result);
    });

    await step.run("complete-rerun", async () => {
      await resetRerunFlag(newsRequestId);
      const summaryParts: string[] = [];
      if ((outcome.updatedStories as unknown[]).length > 0) {
        summaryParts.push(
          `${(outcome.updatedStories as unknown[]).length} story(ies) updated`,
        );
      }
      if ((outcome.newStories as unknown[]).length > 0) {
        summaryParts.push(
          `${(outcome.newStories as unknown[]).length} new story(ies)`,
        );
      }
      if (summaryParts.length === 0) {
        summaryParts.push("No material story changes");
      }
      await tryCreatePipelineNotification(
        newsPipelineRerunCompletedNotification({
          userId,
          newsRequestId,
          eventId: event.id,
          summary: summaryParts.join("; "),
        }),
        { newsRequestId },
      );
    });

    return outcome;
  },
);
