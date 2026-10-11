/**
 * News generation pipeline (Inngest) — system briefing / NewsRequest fulfillment
 *
 * Event: `news/pipeline.requested`
 *
 * Trigger: news request API / Inngest send after user submits briefing options
 * (`NewsRequest` row). Progress lines append to `NewsRequest.loadingLogs` during run.
 *
 * Function id: `news-pipeline`
 * Timeout: 45 minutes (`timeouts.finish`)
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
 * custom query + optional `site:` filters; local Google Search news tab uses
 * `lat`/`lon`/`radius` when the request has coordinates, else Serp `location`
 * (+ `gl`/`hl`). `google_news` uses q + gl/hl only. Result volume scales with
 * `storyCount`
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
 * Stage logic lives in `services/news/newsBriefingStages.ts` (shared with the
 * dry-run `pnpm news:funnel`); each stage returns per-region funnel counts.
 *
 * 4. fetch-and-normalize-serp — `discoverNewsCandidates`
 *    Per tier, in parallel: tier plan (Google News + Google with `tbs` date range +
 *    YouTube), short topic queries (15s cap each), AI-overview follow-up; plus direct
 *    publisher feeds from `config/newsSources.json` (RSS / news sitemaps, 5s timeout,
 *    5 min cache; India feeds back the local tier for Indian locations).
 *    Round-robin merge across sources → URL + near-duplicate-title dedupe →
 *    request-day + previous-day window → tip/buy-sell junk filter.
 *
 * 5–8. YouTube branch (parallel with article branch after step 4)
 *    select-youtube-videos → fetch-youtube-transcripts → analyze-youtube-transcripts
 *    → synthesize-youtube-transcript-facts.
 *
 * 9–10. Article branch (parallel with YouTube branch after step 4)
 *    select-articles — `rankArticlesForScrape`: AI ranks the candidate budget by
 *    relative importance (junk floor only, no pass/fail threshold); top
 *    2× N (min 8) go to Firecrawl (15s cap each), the rest are a ranked reserve.
 *    scrape-selected-articles — `scrapeAndCleanArticles` (Firecrawl + cleaner).
 *    scrape-backfill-articles — only when cleaned articles < N + 1: one more batch
 *    from the reserve.
 *
 * 11. synthesize-stories — `synthesizeNewsStories`
 *     Ranks events by relative importance and returns the top N; if the first pass
 *     yields fewer, one backfill pass over unused articles, then article-derived
 *     fallback stories. Shortfall (genuinely too few articles) is logged.
 *
 * 11b. record-funnel — logs the funnel table and saves it on
 *     `NewsRequest.searchQuery.funnel`.
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
 *
 * ── Agents & model env vars ─────────────────────────────────────────────────
 *
 * | Step                         | Agent / module                         | Env override(s)              |
 * |------------------------------|----------------------------------------|------------------------------|
 * | AI Overview follow-up queries| `GAIOverviewSearchGeneratorAgents`     | `GAI_OVERVIEW_SEARCH_MODEL`  |
 * | Article / YouTube selection  | `ResearchArticleSelectorAgent`         | `RESEARCH_ARTICLE_SELECTOR_MODEL` |
 * | YouTube pick (pre-transcript)| `YoutubeVideoAgent`                    | `YOUTUBE_VIDEO_AGENT_MODEL`  |
 * | Per-video transcript analysis| `YoutubeTranscriptAgent`               | `YOUTUBE_TRANSCRIPT_AGENT_MODEL` |
 * | Transcript fact merge        | `YoutubeTranscriptSynthesizeAgent`     | `YOUTUBE_TRANSCRIPT_SYNTHESIZE_MODEL` |
 * | Firecrawl body cleanup       | `NewsContentCleanerAgent`              | `NEWS_CONTENT_CLEANER_MODEL` |
 * | Story clustering + copy      | `NewsSynthesizerAgent`                 | `NEWS_SYNTHESIZER_MODEL`     |
 *
 * Non-LLM: `Agents/news/searchPlanner.ts` and `services/news/newsSearchPlanning.ts` build Serp
 * query strings. Default model fallback chain: per-agent env → `OPENAI_MODEL` → `gpt-4o-mini`.
 */

import { storyHasPrimaryArticleSource } from "@/Agents/news/NewsSythesizeragent";
import { runYoutubeTranscriptSynthesizeAgent } from "@/Agents/news/YoutubeTranscriptSyntesizeAgent";
import { youtubeTranscriptAnalysisSchema } from "@/Agents/news/YoutubeTranscriptAgent";
import { createPipelineLogger } from "@/clients/pipelineLogger";
import { inngest } from "@/clients/inngestClient";
import { newsSearchQuerySchema } from "@/lib/newsSearchQuerySchema";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import {
  appendNewsRequestLoadingLog,
  getNewsRequestById,
  getNewsRequestByIdForUser,
  patchNewsRequest,
} from "@/repositories/newsRequest";
import { createNewsSource } from "@/repositories/newsSource";
import {
  createNewsStory,
  listNewsStoriesByNewsRequestId,
  patchNewsStory,
} from "@/repositories/newsStory";
import { canonicalResearchUrl } from "@/services/chat/normalizeSerpResults";
import { resolveNewsStoryImageUrl } from "@/services/news/articleImageUrl";
import {
  buildRegionLookup,
  discoverNewsCandidates,
  formatFunnel,
  mergeFunnels,
  needsScrapeBackfill,
  rankArticlesForScrape,
  scrapeAndCleanArticles,
  scrapeBackfillBatch,
  synthesizeNewsStories,
} from "@/services/news/newsBriefingStages";
import {
  newsGenerationConfigFromNewsRequest,
  newsGenerationConfigSchema,
  newsPipelineGenerationEventSchema,
} from "@/services/news/newsGenerationRequest";
import {
  buildArticleSelectionPrompt,
  buildNewsSearchExecutionPlans,
  buildNewsTopicSearchPlans,
} from "@/services/news/newsSearchPlanning";
import { toJsonSafeStepOutput } from "@/services/news/normalizeArticles";
import {
  analyzeYoutubeTranscriptsInParallel,
  buildYoutubeArticlesForSynthesizer,
  fetchYoutubeTranscriptsByVideoIds,
  selectYoutubeVideosForNewsResearch,
} from "@/services/news/youtubeResearch";
import {
  newsPipelineCompletedNotification,
  newsPipelineFailedNotification,
  tryCreatePipelineNotification,
} from "@/services/notifications/pipelineNotifications";
import { z } from "zod";

export const NEWS_PIPELINE_EVENT = "news/pipeline.requested" as const;

const newsPipelineControlSchema = z.object({
  editionBuild: z.boolean().optional(),
  skipCompletionNotification: z.boolean().optional(),
  append: z.boolean().optional(),
  overrideStoryCount: z.number().int().min(1).max(20).optional(),
});

export const newsPipelineEventDataSchema = z
  .object({
    userId: z.string().min(1),
    newsRequestId: z.uuid(),
  })
  .extend(newsPipelineGenerationEventSchema.shape)
  .extend(newsPipelineControlSchema.shape);

export type NewsPipelineEventData = z.infer<typeof newsPipelineEventDataSchema>;

const PIPELINE_LOG_PREFIX = "[news-pipeline]";
const pipelineLog = createPipelineLogger(PIPELINE_LOG_PREFIX);

const DEFAULT_NEWS_SYNTHESIZER_MODEL = "gpt-5.4-mini";

function resolveNewsSynthesizerModel(): string {
  return resolveOpenAiModelId(
    undefined,
    process.env.NEWS_SYNTHESIZER_MODEL ?? DEFAULT_NEWS_SYNTHESIZER_MODEL,
  );
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
        pipelineLog(
          "create-failure-notification",
          "skipped invalid event data",
        );
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
      const row = input.editionBuild
        ? await getNewsRequestById(input.newsRequestId)
        : await getNewsRequestByIdForUser(input.newsRequestId, input.userId);
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
    let config = newsGenerationConfigSchema.parse(loaded.config);
    if (input.overrideStoryCount != null) {
      config = { ...config, storyCount: input.overrideStoryCount };
    }

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
        const topicPlans = buildNewsTopicSearchPlans(config);
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
          topicPlans,
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
            topicQueries: plans.topicPlans.map((plan) => ({
              tier: plan.tier,
              query: plan.query,
            })),
            ...(config.latitude != null && config.longitude != null
              ? {
                  locationGeo: {
                    latitude: config.latitude,
                    longitude: config.longitude,
                    ...(config.locationRadiusMeters != null
                      ? { radiusMeters: config.locationRadiusMeters }
                      : {}),
                  },
                }
              : {}),
          },
          ...(config.latitude != null && config.longitude != null
            ? {
                latitude: config.latitude,
                longitude: config.longitude,
              }
            : {}),
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
          pipelineLog("fetch-and-normalize-serp", "start", {
            tierPlans: plans.executionPlans.length,
            topicPlans: plans.topicPlans.length,
          });
          const result = await discoverNewsCandidates({
            config,
            executionPlans: plans.executionPlans,
            topicPlans: plans.topicPlans,
            log: (event, data) =>
              pipelineLog("fetch-and-normalize-serp", event, data),
          });
          pipelineLog("fetch-and-normalize-serp", "done", {
            funnel: result.funnel.stages,
            sources: result.funnel.sources,
          });
          await appendNewsRequestLoadingLog(
            newsRequest.id,
            "Finding relevant stories.",
          );
          return toJsonSafeStepOutput(result);
        },
      );

      const normalized = serpBundle.articles;
      const youtubeSerpPayload = serpBundle.youtubeSerpPayload;

      if (normalized.length === 0) {
        throw new Error("No articles returned from Serp normalization");
      }

      const researchPrompt = buildArticleSelectionPrompt(config);

      pipelineLog("step", "entering parallel research branches");
      const [
        { youtubeTranscripts, youtubeAnalyses, youtubeSynthesis },
        { researched, articleFunnel },
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
          const ranking = await step.run("select-articles", async () => {
            const result = await rankArticlesForScrape({
              config,
              articles: normalized,
              researchPrompt,
            });
            pipelineLog("select-articles", "done", {
              funnel: result.funnel.stages,
            });
            return toJsonSafeStepOutput(result);
          });

          pipelineLog("step", "entering scrape-selected-articles");
          const scraped = await step.run(
            "scrape-selected-articles",
            async () => {
              const result = await scrapeAndCleanArticles({
                config,
                selected: ranking.selected,
                normalized,
              });
              pipelineLog("scrape-selected-articles", "done", {
                funnel: result.funnel.stages,
              });
              await appendNewsRequestLoadingLog(
                newsRequest.id,
                "Checking sources.",
              );
              return toJsonSafeStepOutput(result);
            },
          );

          // Backfill from the ranked reserve only when scrapes left us short.
          const backfill = needsScrapeBackfill(
            config.storyCount,
            scraped.researched.length,
            ranking.reserve.length,
          )
            ? await step.run("scrape-backfill-articles", async () => {
                const result = await scrapeAndCleanArticles({
                  config,
                  selected: scrapeBackfillBatch(
                    ranking.reserve,
                    config.storyCount,
                    scraped.researched.length,
                  ),
                  normalized,
                  stagePrefix: "backfill-",
                });
                pipelineLog("scrape-backfill-articles", "done", {
                  funnel: result.funnel.stages,
                });
                return toJsonSafeStepOutput(result);
              })
            : null;

          return {
            researched: [
              ...scraped.researched,
              ...(backfill?.researched ?? []),
            ],
            articleFunnel: mergeFunnels(
              ranking.funnel,
              scraped.funnel,
              backfill?.funnel,
            ),
          };
        })(),
      ]);

      pipelineLog("step", "entering synthesize-stories");
      const synthesis = await step.run("synthesize-stories", async () => {
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
        const result = await synthesizeNewsStories({
          config,
          newsRequestId: newsRequest.id,
          articles: [...researched, ...youtubeArticles],
          regionOf: buildRegionLookup(researched),
          youtubeTranscriptSynthesis: youtubeSynthesis,
          researchPrompt,
          model: synthesizerModel,
        });
        pipelineLog("synthesize-stories", "done", {
          storyCount: result.stories.length,
          stats: result.stats,
        });
        return toJsonSafeStepOutput(result);
      });
      const synthesized = synthesis.stories;

      await step.run("record-funnel", async () => {
        const funnel = mergeFunnels(
          serpBundle.funnel,
          articleFunnel,
          synthesis.funnel,
        );
        pipelineLog("funnel", formatFunnel(funnel));
        if (funnel.shortfall) {
          pipelineLog("funnel", "shortfall", { reason: funnel.shortfall });
        }
        const row = await getNewsRequestByIdForUser(
          newsRequest.id,
          input.userId,
        );
        const existing =
          row?.searchQuery && typeof row.searchQuery === "object"
            ? (row.searchQuery as Record<string, unknown>)
            : {};
        await patchNewsRequest(newsRequest.id, {
          searchQuery: newsSearchQuerySchema.parse({ ...existing, funnel }),
        });
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
        const existingStories = input.append
          ? await listNewsStoriesByNewsRequestId(newsRequest.id)
          : [];
        const existingUrlKeys = new Set<string>();
        for (const row of existingStories) {
          for (const source of row.sourceUrls ?? []) {
            const key = canonicalResearchUrl(source.url);
            if (key) {
              existingUrlKeys.add(key);
            }
          }
        }
        let nextRank =
          existingStories.reduce(
            (max, row) => Math.max(max, row.rank ?? 0),
            0,
          ) || 0;
        const targetTotal = config.storyCount;
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
          if (input.append && nextRank >= targetTotal) {
            break;
          }
          const primaryUrl = story.sources[0]?.url;
          const primaryKey = primaryUrl
            ? canonicalResearchUrl(primaryUrl)
            : null;
          if (input.append && primaryKey && existingUrlKeys.has(primaryKey)) {
            continue;
          }
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

          nextRank += 1;
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
            rank: nextRank,
            newsSourceIds: [],
            imageUrl: storyImageUrl,
            loadingLogs: ["Story added to your briefing."],
          });
          if (primaryKey) {
            existingUrlKeys.add(primaryKey);
          }

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

      if (!input.skipCompletionNotification) {
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
      }

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
