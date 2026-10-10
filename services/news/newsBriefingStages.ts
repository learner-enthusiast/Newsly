/**
 * News briefing stages shared by `inngest/newsPipeline.ts` (one stage per
 * Inngest step) and `scripts/newsFunnel.ts` (dry-run measurement, no DB writes).
 *
 * Every stage returns the rows it produced plus funnel counts per region, so a
 * run can show where candidates drop:
 *   fetched → deduped → in window → junk-filtered → AI-ranked candidates →
 *   kept by rank → Firecrawl ok/fail → cleaned → synthesized → returned
 */

import { runGaiOverviewSearchGeneratorAgent } from "@/Agents/news/GAIOverviewSearchGeneratorAgents";
import { runNewsContentCleanerAgent } from "@/Agents/news/NewsContentCleanerAgent";
import {
  runNewsSynthesizerAgentWithStats,
  storyHasPrimaryArticleSource,
  type NewsSynthesizerStats,
  type SynthesizedNewsStory,
} from "@/Agents/news/NewsSythesizeragent";
import {
  buildNewsBriefingSelectorSystemPrompt,
  runResearchArticleSelectorAgent,
  type SelectedResearchArticle,
} from "@/Agents/news/ResearchArticleSelectorAgent";
import { serpEngines } from "@/SERP/index";
import { firecrawlClient } from "@/clients/FireCrawlClient";
import { scrapeMarkdownFromFirecrawl } from "@/services/chat/chatSerpResearch";
import { resolveArticleImageUrl } from "@/services/news/articleImageUrl";
import type { NewsGenerationConfig } from "@/services/news/newsGenerationRequest";
import {
  googleRecencyTbs,
  pickSerpSharedGeoFromSearchParams,
  preferArticlesFromSources,
  serpResultsPerEngine,
  withGoogleRecencyFilter,
  type NewsSearchExecutionPlan,
  type NewsTopicSearchPlan,
} from "@/services/news/newsSearchPlanning";
import {
  appendGoogleSearchSerpResults,
  applySelectionWeightBoosts,
  dedupeNearDuplicateTitles,
  excludeTradingRecommendationArticles,
  extractAiOverviewTextFromSerpPayload,
  filterArticlesInRequestWindow,
  followUpBoostedUrlKeys,
  interleaveSerpPayloads,
  isTradingRecommendationArticle,
  mergeSerpPayloads,
  normalizeSerpArticles,
  serpPayloadHasAiOverview,
  slimSerpPayloadForNormalize,
  wrapAiOverviewFollowUpSerpPayload,
  type NormalizedArticleLink,
} from "@/services/news/normalizeArticles";
import {
  fetchRegionFeedCandidates,
  type FeedSourceStats,
} from "@/services/news/sources/feedSources";
import { extractTopYoutubeVideoResults } from "@/services/news/youtubeResearch";

export type NewsRegion = "local" | "world";

export type FunnelStage = {
  stage: string;
  total: number;
  local?: number;
  world?: number;
  note?: string;
};

export type NewsFunnel = {
  stages: FunnelStage[];
  sources: FeedSourceStats[];
  timingsMs: Record<string, number>;
  shortfall?: string;
};

/** Topic queries are additive; drop a slow one rather than hold up the step. */
const TOPIC_SERP_TIMEOUT_MS = 15_000;
/** Per-article caps: one slow page must not hold up the whole scrape step. */
const FIRECRAWL_TIMEOUT_MS = 15_000;
const CLEANER_TIMEOUT_MS = 25_000;
/** The synthesizer reads ~7k chars per article; cleaning more only adds latency. */
const CLEANER_INPUT_MAX_CHARS = 9_000;

/** A Firecrawl failure faster than this is treated as a rejection worth one retry. */
const FIRECRAWL_FAST_FAILURE_MS = 5_000;
const FIRECRAWL_RETRY_DELAY_MS = 1_500;
/** AI ranking: candidates per parallel selector call. */
const RANK_BATCH_SIZE = 17;

/** Candidates sent to AI ranking (split into parallel batches). */
export function rankCandidateBudget(storyCount: number): number {
  return Math.min(60, Math.max(30, storyCount * 10));
}

function errorLabel(error: unknown): string {
  if (error && typeof error === "object") {
    const record = error as { statusCode?: unknown; status?: unknown };
    const status = record.statusCode ?? record.status;
    if (typeof status === "number") {
      return String(status);
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 40);
}

/**
 * Firecrawl one URL; one retry after a short delay when the first attempt is
 * rejected quickly (rate limit / transient), all inside `FIRECRAWL_TIMEOUT_MS`.
 */
async function scrapeOnce(
  url: string,
): Promise<{ markdown: string; raw: unknown } | { error: string }> {
  const deadline = Date.now() + FIRECRAWL_TIMEOUT_MS;
  let lastError = "empty";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const started = Date.now();
    const remaining = deadline - started;
    if (remaining <= 0) {
      return { error: "timeout" };
    }
    try {
      const raw = await rejectAfter(firecrawlClient.scrape({ url }), remaining);
      if (raw === TIMED_OUT) {
        return { error: "timeout" };
      }
      const markdown = scrapeMarkdownFromFirecrawl(raw)?.trim() ?? "";
      if (markdown) {
        return { markdown, raw };
      }
      lastError = "empty";
    } catch (error) {
      lastError = errorLabel(error);
    }
    if (Date.now() - started > FIRECRAWL_FAST_FAILURE_MS) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, FIRECRAWL_RETRY_DELAY_MS));
  }
  return { error: lastError };
}

/** Firecrawl shortlist: 2× N (min 8); the ranked reserve backfills failures. */
export function firecrawlShortlistSize(storyCount: number): number {
  return Math.max(8, storyCount * 2);
}

/** URL identity that survives tracking-param / trailing-slash differences. */
function urlIdentity(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return raw;
  }
}

export function buildRegionLookup(
  rows: Array<{ url: string; region?: NewsRegion }>,
): (url: string) => NewsRegion | undefined {
  const map = new Map(rows.map((row) => [urlIdentity(row.url), row.region]));
  return (url) => map.get(urlIdentity(url));
}
/** Firecrawl a second batch only when the first leaves fewer than N + this. */
const SCRAPE_BACKFILL_MARGIN = 1;

export function emptyFunnel(): NewsFunnel {
  return { stages: [], sources: [], timingsMs: {} };
}

export function funnelStage(
  stage: string,
  rows: Array<{ region?: NewsRegion }>,
  note?: string,
): FunnelStage {
  const local = rows.filter((row) => row.region === "local").length;
  const world = rows.filter((row) => row.region === "world").length;
  return {
    stage,
    total: rows.length,
    ...(local > 0 ? { local } : {}),
    ...(world > 0 ? { world } : {}),
    ...(note ? { note } : {}),
  };
}

function resolveWithin<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

const TIMED_OUT = Symbol("timed-out");

/** Like `resolveWithin`, but rejections propagate (so errors can be retried). */
function rejectAfter<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(TIMED_OUT), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function settledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

function serpRowCount(payload: unknown): number {
  if (!payload || typeof payload !== "object") {
    return 0;
  }
  const record = payload as Record<string, unknown>;
  return ["news_results", "organic_results"].reduce(
    (sum, key) =>
      sum + (Array.isArray(record[key]) ? (record[key] as unknown[]).length : 0),
    0,
  );
}

/** Round-robin across lists so no single query/feed fills the head of the pool. */
function interleaveLists<T>(lists: T[][]): T[] {
  const longest = Math.max(0, ...lists.map((list) => list.length));
  const out: T[] = [];
  for (let i = 0; i < longest; i += 1) {
    for (const list of lists) {
      if (i < list.length) {
        out.push(list[i]!);
      }
    }
  }
  return out;
}

/** Request day + previous day (UTC), matching `filterArticlesInRequestWindow`. */
export function requestTimeWindow(dateIso: string): { start: Date; end: Date } {
  const dayStart = Date.parse(`${dateIso}T00:00:00.000Z`);
  return {
    start: new Date(dayStart - 86_400_000),
    end: new Date(dayStart + 86_400_000),
  };
}

function isIndiaLocation(location: string | null): boolean {
  return /\bindia\b/i.test(location ?? "") || location == null;
}

type TierSerpResult = {
  articles: NormalizedArticleLink[];
  youtube: unknown[];
  rawRows: number;
  calls: number;
  failedCalls: number;
};

async function searchTier(input: {
  config: NewsGenerationConfig;
  tier: NewsRegion;
  tierPlans: NewsSearchExecutionPlan[];
  topicPlans: NewsTopicSearchPlan[];
  log: StageLogger;
}): Promise<TierSerpResult> {
  const { config, tier, tierPlans, topicPlans, log } = input;
  const serpNum = serpResultsPerEngine(config.storyCount);

  const [tierResults, topicResults] = await Promise.all([
    Promise.all(
      tierPlans.map(async (plan) => {
        const [news, search, youtube] = await Promise.allSettled([
          serpEngines.searchGoogleNews.fn({ ...plan.googleNewsParams, num: serpNum }),
          serpEngines.searchGoogle.fn({
            ...withGoogleRecencyFilter(plan.googleSearchParams, config.date),
            num: serpNum,
            trigger_ai_overview: true,
          }),
          serpEngines.searchYoutube.fn(plan.youtubeParams),
        ]);
        return {
          news: settledValue(news),
          search: settledValue(search),
          youtube: settledValue(youtube),
        };
      }),
    ),
    Promise.all(
      topicPlans.map(async (plan) => {
        const [news, search] = await Promise.all([
          resolveWithin(
            serpEngines.searchGoogleNews.fn(plan.googleNewsParams),
            TOPIC_SERP_TIMEOUT_MS,
          ),
          resolveWithin(
            serpEngines.searchGoogle.fn({ ...plan.googleSearchParams, num: serpNum }),
            TOPIC_SERP_TIMEOUT_MS,
          ),
        ]);
        return { news, search };
      }),
    ),
  ]);

  const newsPayloads = [...tierResults, ...topicResults].map((row) => row.news);
  const searchPayloads = [...tierResults, ...topicResults].map((row) => row.search);
  const googleNewsPayload = interleaveSerpPayloads(newsPayloads);
  const googleSearchPayload = interleaveSerpPayloads(searchPayloads);

  let mergedSearchPayload: unknown = googleSearchPayload;
  let followUpPayloads: unknown[] = [];
  const primaryPlan = tierPlans[0];
  if (primaryPlan && serpPayloadHasAiOverview(googleSearchPayload)) {
    const aiOverviewText = extractAiOverviewTextFromSerpPayload(googleSearchPayload);
    if (aiOverviewText) {
      const generated = await runGaiOverviewSearchGeneratorAgent({
        aiOverviewText,
        date: config.date,
        location: tier === "local" ? (config.location ?? undefined) : undefined,
        scope: tier,
        abortSignal: AbortSignal.timeout(120_000),
      });
      const gl = primaryPlan.news.suggestedGl ?? primaryPlan.search.suggestedGl;
      const shared = {
        num: serpNum,
        ...(gl ? { gl } : {}),
        hl: primaryPlan.news.suggestedHl ?? config.serpHl,
        tbs: googleRecencyTbs(config.date),
        ...pickSerpSharedGeoFromSearchParams(primaryPlan.googleSearchParams),
      };
      followUpPayloads = (
        await Promise.all(
          generated.queries.map((row) =>
            resolveWithin(
              serpEngines.searchGoogle.fn({ q: row.query, ...shared }),
              TOPIC_SERP_TIMEOUT_MS,
            ),
          ),
        )
      )
        .filter((payload) => payload != null)
        .map(wrapAiOverviewFollowUpSerpPayload);
      mergedSearchPayload = appendGoogleSearchSerpResults(
        googleSearchPayload,
        followUpPayloads,
      );
      log("ai-overview-follow-up", { tier, queries: generated.queries.length });
    }
  }

  const planCount = tierPlans.length + topicPlans.length;
  const limitPerEngine = Math.min(80, serpNum * Math.max(1, planCount));
  const normalized = normalizeSerpArticles({
    googleNewsPayload: slimSerpPayloadForNormalize(googleNewsPayload, limitPerEngine),
    googleSearchPayload: slimSerpPayloadForNormalize(mergedSearchPayload, limitPerEngine),
    limitPerEngine,
  });
  const boosted = applySelectionWeightBoosts(
    normalized,
    followUpBoostedUrlKeys(googleSearchPayload, followUpPayloads),
  );

  const allPayloads = [...newsPayloads, ...searchPayloads, ...followUpPayloads];
  return {
    articles: boosted.map((article) => ({ ...article, region: tier })),
    youtube: tierResults.map((row) => row.youtube),
    rawRows: allPayloads.reduce<number>((sum, payload) => sum + serpRowCount(payload), 0),
    calls: tierPlans.length * 3 + topicPlans.length * 2 + followUpPayloads.length,
    failedCalls:
      tierResults.filter((row) => row.news == null).length +
      tierResults.filter((row) => row.search == null).length +
      topicResults.filter((row) => row.news == null).length +
      topicResults.filter((row) => row.search == null).length,
  };
}

export type StageLogger = (event: string, data?: Record<string, unknown>) => void;

/**
 * Stage 1: Serp (tier + topic queries, AI-overview follow-up) and direct
 * publisher feeds, all in parallel; merged round-robin per source, deduped by
 * URL and near-identical title, windowed to the request day, junk-filtered.
 */
export async function discoverNewsCandidates(input: {
  config: NewsGenerationConfig;
  executionPlans: NewsSearchExecutionPlan[];
  topicPlans: NewsTopicSearchPlan[];
  log?: StageLogger;
}): Promise<{
  articles: NormalizedArticleLink[];
  youtubeSerpPayload: { video_results: ReturnType<typeof extractTopYoutubeVideoResults> };
  funnel: NewsFunnel;
}> {
  const { config } = input;
  const log = input.log ?? (() => {});
  const started = Date.now();
  const tiers: NewsRegion[] = [
    ...new Set(input.executionPlans.map((plan) => plan.tier)),
  ];
  const window = requestTimeWindow(config.date);

  const [serpByTier, feedsByTier] = await Promise.all([
    Promise.all(
      tiers.map((tier) =>
        searchTier({
          config,
          tier,
          tierPlans: input.executionPlans.filter((plan) => plan.tier === tier),
          topicPlans: input.topicPlans.filter((plan) => plan.tier === tier),
          log,
        }),
      ),
    ),
    Promise.all(
      tiers.map(async (tier) => {
        // Indian publisher feeds back the local tier only for Indian locations.
        if (tier === "local" && !isIndiaLocation(config.location)) {
          return { tier, lists: [], stats: [] };
        }
        const result = await fetchRegionFeedCandidates({
          region: tier === "local" ? "india" : "world",
          window,
        });
        return {
          tier,
          lists: result.lists.map((list) =>
            list.map((item) => ({ ...item, region: tier, index: 0 })),
          ),
          stats: result.stats,
        };
      }),
    ),
  ]);

  const serpLists = serpByTier.map((row) => row.articles);
  const feedLists = feedsByTier.flatMap((row) => row.lists);
  const fetchedRows: Array<{ region?: NewsRegion }> = [
    ...serpByTier.flatMap((row, index) =>
      Array.from({ length: row.rawRows }, () => ({ region: tiers[index] })),
    ),
    ...feedsByTier.flatMap((row) =>
      row.stats.flatMap((stat) =>
        Array.from({ length: stat.fetched }, () => ({ region: row.tier })),
      ),
    ),
  ];

  // Pre-rank: interleave Serp lists (Google relevance order) and each feed
  // (newest first) so every source reaches the AI-ranked candidate budget.
  const merged = interleaveLists<NormalizedArticleLink>([...serpLists, ...feedLists]);
  const seenUrls = new Set<string>();
  const urlDeduped = merged.filter((article) => {
    if (seenUrls.has(article.url)) {
      return false;
    }
    seenUrls.add(article.url);
    return true;
  });
  const deduped = dedupeNearDuplicateTitles(urlDeduped);
  const inWindow = filterArticlesInRequestWindow(deduped, config.date);
  const eligible = excludeTradingRecommendationArticles(inWindow).map(
    (article, index) => ({ ...article, index }),
  );

  let youtubePayload: unknown = {};
  for (const payload of serpByTier.flatMap((row) => row.youtube)) {
    youtubePayload = mergeSerpPayloads(youtubePayload, payload);
  }

  const serpCalls = serpByTier.reduce((sum, row) => sum + row.calls, 0);
  const serpFailed = serpByTier.reduce((sum, row) => sum + row.failedCalls, 0);
  const sources = feedsByTier.flatMap((row) => row.stats);
  return {
    articles: eligible,
    youtubeSerpPayload: {
      video_results: extractTopYoutubeVideoResults(youtubePayload, 10),
    },
    funnel: {
      stages: [
        funnelStage(
          "fetched",
          fetchedRows,
          `serp calls=${serpCalls} failed/timeout=${serpFailed}; feeds ok=${sources.filter((s) => s.ok).length}/${sources.length}`,
        ),
        funnelStage("unique-url", urlDeduped),
        funnelStage("deduped", deduped, "near-duplicate titles removed"),
        funnelStage("in-time-window", inWindow, "request day + previous day (UTC)"),
        funnelStage("junk-filtered", eligible, "tip/buy-sell pages removed by title/snippet"),
      ],
      sources,
      timingsMs: { discover: Date.now() - started },
    },
  };
}

/**
 * Stage 2: AI ranks the pre-ranked candidate budget by relative importance
 * (junk floor only). Returns the top `maxArticlesToScrape` plus a ranked reserve
 * used to backfill when scrapes fail.
 */
export async function rankArticlesForScrape(input: {
  config: NewsGenerationConfig;
  articles: NormalizedArticleLink[];
  researchPrompt: string;
}): Promise<{
  selected: SelectedResearchArticle[];
  reserve: SelectedResearchArticle[];
  funnel: NewsFunnel;
}> {
  const started = Date.now();
  const { config } = input;
  const budget = rankCandidateBudget(config.storyCount);
  const scrapeBudget = firecrawlShortlistSize(config.storyCount);
  const candidates = preferArticlesFromSources(input.articles, config.sources).slice(0, budget);
  const regionOf = buildRegionLookup(candidates);

  // Parallel batches (candidate i → batch i % k keeps every batch source-mixed);
  // smaller calls finish faster than one big one. Batch rankings are merged
  // round-robin by rank, so each batch's best articles lead the shortlist.
  const batchCount = Math.max(1, Math.ceil(candidates.length / RANK_BATCH_SIZE));
  const batches = Array.from({ length: batchCount }, (_, batch) =>
    candidates.filter((_, index) => index % batchCount === batch),
  ).filter((batch) => batch.length > 0);
  const batchResults = await Promise.all(
    batches.map((batch) =>
      runResearchArticleSelectorAgent({
        userPrompt: input.researchPrompt,
        links: batch.map((article) => ({
          url: article.url,
          title: article.title,
          snippet: article.snippet,
          source: article.source,
          sourceType: article.sourceType,
          selectionWeight: article.selectionWeight,
          fromAiOverviewFollowUp: article.fromAiOverviewFollowUp,
        })),
        topPercent: 100,
        system: buildNewsBriefingSelectorSystemPrompt(),
        abortSignal: AbortSignal.timeout(180_000),
      }).catch(() => [] as SelectedResearchArticle[]),
    ),
  );
  const ranked = interleaveLists(batchResults).filter(
    (article) => !isTradingRecommendationArticle({ title: article.title }),
  );

  const tagged = (rows: SelectedResearchArticle[]) =>
    rows.map((row) => ({ region: regionOf(row.url) }));
  const selected = ranked.slice(0, scrapeBudget);
  return {
    selected,
    reserve: ranked.slice(scrapeBudget),
    funnel: {
      stages: [
        funnelStage("ai-rank-candidates", candidates, `budget=${budget} in ${batches.length} parallel batches`),
        funnelStage("ai-rank-above-floor", tagged(ranked), "junk floor only; everything else ranked"),
        funnelStage("shortlisted-for-firecrawl", tagged(selected), `top ${scrapeBudget} by rank`),
      ],
      sources: [],
      timingsMs: { rank: Date.now() - started },
    },
  };
}

export type ResearchedNewsArticle = {
  index: number;
  url: string;
  domain: string;
  title: string;
  sourceType: string;
  scrapedContent: string;
  publishedAt: Date | null;
  isPrimaryStorySource: true;
  imageUrl: string | null;
  region?: NewsRegion;
};

/** Stage 3: Firecrawl + content cleaner over shortlisted articles. */
export async function scrapeAndCleanArticles(input: {
  config: NewsGenerationConfig;
  selected: SelectedResearchArticle[];
  normalized: NormalizedArticleLink[];
  stagePrefix?: string;
}): Promise<{ researched: ResearchedNewsArticle[]; funnel: NewsFunnel }> {
  const started = Date.now();
  const { config, selected, normalized } = input;
  const prefix = input.stagePrefix ?? "";
  const byUrl = new Map(normalized.map((row) => [urlIdentity(row.url), row]));

  // Each article is scraped then cleaned on its own, so the step costs the
  // slowest single scrape+clean, not slowest scrape + slowest clean.
  const outcome = await Promise.all(
    selected.map(async (article, index) => {
      const match = byUrl.get(urlIdentity(article.url));
      const region = match?.region;
      const scraped = await scrapeOnce(article.url);
      if ("error" in scraped) {
        return { status: "firecrawl-fail" as const, region, error: scraped.error };
      }
      const bundle = scraped;
      const raw = scraped.markdown;
      if (isTradingRecommendationArticle({ title: article.title, scrapedContent: raw })) {
        return { status: "tip-page" as const, region };
      }
      try {
        const cleaned = await runNewsContentCleanerAgent({
          location: config.location,
          date: config.date,
          content: raw.slice(0, CLEANER_INPUT_MAX_CHARS),
          abortSignal: AbortSignal.timeout(CLEANER_TIMEOUT_MS),
        });
        if (!cleaned.isValidArticle || !cleaned.cleanedContent.trim()) {
          return { status: "not-an-article" as const, region };
        }
        const row: ResearchedNewsArticle = {
          index: match?.index ?? index,
          url: article.url,
          domain: article.domain,
          title: article.title,
          sourceType: article.sourceType,
          scrapedContent: cleaned.cleanedContent,
          publishedAt: match?.publishedAt ? new Date(match.publishedAt) : null,
          isPrimaryStorySource: true,
          imageUrl: resolveArticleImageUrl({
            firecrawlPayload: bundle?.raw,
            serpImageUrl: match?.imageUrl ?? null,
          }),
          ...(region ? { region } : {}),
        };
        return { status: "ok" as const, region, row };
      } catch {
        return { status: "cleaner-error" as const, region };
      }
    }),
  );

  const researched = outcome.flatMap((row) => ("row" in row && row.row ? [row.row] : []));
  const byStatus = (status: string) => outcome.filter((row) => row.status === status);
  return {
    researched,
    funnel: {
      stages: [
        funnelStage(
          `${prefix}firecrawl-ok`,
          outcome.filter((row) => row.status !== "firecrawl-fail"),
          `failed=${byStatus("firecrawl-fail").length}${firecrawlErrorSummary(outcome)}`,
        ),
        funnelStage(
          `${prefix}cleaned-articles`,
          researched,
          `tip-pages=${byStatus("tip-page").length} not-article=${byStatus("not-an-article").length} cleaner-errors=${byStatus("cleaner-error").length}`,
        ),
      ],
      sources: [],
      timingsMs: { [`${prefix}scrape`]: Date.now() - started },
    },
  };
}

function firecrawlErrorSummary(outcome: Array<{ status: string; error?: string }>): string {
  const counts = new Map<string, number>();
  for (const row of outcome) {
    if (row.status === "firecrawl-fail" && row.error) {
      counts.set(row.error, (counts.get(row.error) ?? 0) + 1);
    }
  }
  return counts.size === 0
    ? ""
    : ` (${[...counts].map(([error, count]) => `${error}×${count}`).join(", ")})`;
}

/** True when another Firecrawl batch from the reserve is worth its latency. */
export function needsScrapeBackfill(
  storyCount: number,
  researchedCount: number,
  reserveCount: number,
): boolean {
  return reserveCount > 0 && researchedCount < storyCount + SCRAPE_BACKFILL_MARGIN;
}

/** Reserve slice for the backfill scrape (2× the missing count, at least N). */
export function scrapeBackfillBatch<T>(
  reserve: T[],
  storyCount: number,
  researchedCount: number,
): T[] {
  const missing = Math.max(1, storyCount + SCRAPE_BACKFILL_MARGIN - researchedCount);
  return reserve.slice(0, Math.max(storyCount, missing * 2));
}

/** Stage 4: synthesize stories; backfills up to N from unused articles. */
export async function synthesizeNewsStories(input: {
  config: NewsGenerationConfig;
  newsRequestId: string;
  articles: Parameters<typeof runNewsSynthesizerAgentWithStats>[0]["articles"];
  regionOf: (url: string) => NewsRegion | undefined;
  youtubeTranscriptSynthesis?: { facts: unknown[]; overview: string };
  researchPrompt: string;
  model?: string;
}): Promise<{
  stories: SynthesizedNewsStory[];
  stats: NewsSynthesizerStats;
  funnel: NewsFunnel;
}> {
  const started = Date.now();
  const { config } = input;
  if (!input.articles.some((row) => row.isPrimaryStorySource !== false)) {
    return {
      stories: [],
      stats: {
        inputArticles: 0,
        modelStories: 0,
        firstPassStories: 0,
        backfillStories: 0,
        fallbackStories: 0,
      },
      funnel: {
        stages: [funnelStage("returned", [])],
        sources: [],
        timingsMs: { synthesize: 0 },
        shortfall: `returned 0/${config.storyCount}: no usable articles reached synthesis (see ranking/scrape stages)`,
      },
    };
  }
  const result = await runNewsSynthesizerAgentWithStats({
    newsRequestId: input.newsRequestId,
    location: config.location,
    articles: input.articles,
    ...(input.youtubeTranscriptSynthesis
      ? {
          youtubeTranscriptSynthesis:
            input.youtubeTranscriptSynthesis as Parameters<
              typeof runNewsSynthesizerAgentWithStats
            >[0]["youtubeTranscriptSynthesis"],
        }
      : {}),
    // Ask for one spare story so the (sequential) backfill pass is rarely needed.
    userPrompt: `${input.researchPrompt}\n\nReturn the ${config.storyCount + 1} most important distinct stories backed by primary article sources, ranked by relative importance (one spare; the lowest-ranked is dropped).`,
    targetStoryCount: config.storyCount,
    fillToTarget: true,
    ...(input.model ? { model: input.model } : {}),
    abortSignal: AbortSignal.timeout(300_000),
  });

  const returned = result.stories.filter(storyHasPrimaryArticleSource);
  const storyRegion = (story: SynthesizedNewsStory): { region?: NewsRegion } => {
    const counts = { local: 0, world: 0 };
    for (const source of story.sources) {
      const region = input.regionOf(source.url);
      if (region) {
        counts[region] += 1;
      }
    }
    if (counts.local === 0 && counts.world === 0) {
      return {};
    }
    return { region: counts.local >= counts.world ? "local" : "world" };
  };

  const articleCount = input.articles.filter((row) => row.isPrimaryStorySource !== false).length;
  const shortfall =
    returned.length < config.storyCount
      ? `returned ${returned.length}/${config.storyCount}: only ${articleCount} usable articles reached synthesis (first pass ${result.stats.firstPassStories}, backfill +${result.stats.backfillStories}, fallback +${result.stats.fallbackStories})`
      : undefined;

  return {
    stories: returned,
    stats: result.stats,
    funnel: {
      stages: [
        funnelStage(
          "synthesized-stories",
          returned.map(storyRegion),
          `model=${result.stats.modelStories} first-pass=${result.stats.firstPassStories} backfill=+${result.stats.backfillStories} fallback=+${result.stats.fallbackStories}`,
        ),
        funnelStage("returned", returned.slice(0, config.storyCount).map(storyRegion)),
      ],
      sources: [],
      timingsMs: { synthesize: Date.now() - started },
      ...(shortfall ? { shortfall } : {}),
    },
  };
}

/** Concatenate stage funnels (in run order) into one. */
export function mergeFunnels(...parts: Array<NewsFunnel | undefined>): NewsFunnel {
  const merged = emptyFunnel();
  for (const part of parts) {
    if (!part) {
      continue;
    }
    merged.stages.push(...part.stages);
    merged.sources.push(...part.sources);
    Object.assign(merged.timingsMs, part.timingsMs);
    if (part.shortfall) {
      merged.shortfall = part.shortfall;
    }
  }
  return merged;
}

/** One-line-per-stage text table for logs and the measurement script. */
export function formatFunnel(funnel: NewsFunnel): string {
  const lines = funnel.stages.map(
    (stage) =>
      `  ${stage.stage.padEnd(28)} ${String(stage.total).padStart(4)}` +
      (stage.local != null || stage.world != null
        ? `  (local ${stage.local ?? 0} / world ${stage.world ?? 0})`
        : "") +
      (stage.note ? `  — ${stage.note}` : ""),
  );
  const sources = funnel.sources.map(
    (source) =>
      `  source ${source.id.padEnd(20)} ${source.ok ? "ok " : "ERR"} fetched=${source.fetched} inWindow=${source.inWindow} ${source.durationMs}ms${source.error ? ` (${source.error})` : ""}`,
  );
  const timings = Object.entries(funnel.timingsMs)
    .map(([key, ms]) => `${key}=${(ms / 1000).toFixed(1)}s`)
    .join(" ");
  return [
    ...lines,
    ...sources,
    `  timings ${timings}`,
    ...(funnel.shortfall ? [`  SHORTFALL ${funnel.shortfall}`] : []),
  ].join("\n");
}
