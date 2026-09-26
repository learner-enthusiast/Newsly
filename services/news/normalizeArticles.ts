import { extractSerpRowImageUrl } from "@/services/news/articleImageUrl";
import { z } from "zod";

const serpNewsItemSchema = z.looseObject({
  link: z.string().optional(),
  title: z.string().optional(),
  snippet: z.string().optional(),
  date: z.string().optional(),
  iso_date: z.string().optional(),
  published_at: z.string().optional(),
  thumbnail: z.unknown().optional(),
  image: z.string().optional(),
  imageUrl: z.string().optional(),
  source: z
    .union([z.string(), z.looseObject({ name: z.string().optional() })])
    .optional(),
});

const serpOrganicItemSchema = z.looseObject({
  link: z.string().optional(),
  title: z.string().optional(),
  snippet: z.string().optional(),
  thumbnail: z.unknown().optional(),
  image: z.string().optional(),
  imageUrl: z.string().optional(),
});

/** JSON-safe for Inngest step output (no Date instances). */
export const normalizedArticleLinkSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1).optional(),
  snippet: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
  sourceType: z.string().min(1),
  publishedAt: z.string().min(1).optional(),
  index: z.number().int().min(0),
  /** Multiplier for article selector ranking (e.g. 1.4 = 40% boost). */
  selectionWeight: z.number().positive().optional(),
  /** True when the URL came from AI-overview follow-up Google search. */
  fromAiOverviewFollowUp: z.boolean().optional(),
  /** Serp thumbnail/image when present (fallback after Firecrawl metadata). */
  imageUrl: z.string().url().nullable().optional(),
});

export type NormalizedArticleLink = z.infer<typeof normalizedArticleLinkSchema>;

/** Top-level marker on Serp payloads fetched from AI-overview follow-up queries. */
export const SERP_PAYLOAD_AI_OVERVIEW_FOLLOW_UP_KEY = "aiOverviewFollowUpSearch" as const;

/** Per-result marker on merged news/organic rows from AI-overview follow-up Serp. */
export const SERP_ROW_AI_OVERVIEW_FOLLOW_UP_KEY = "aiOverviewFollowUp" as const;

export const SOURCE_TYPE_GOOGLE_SEARCH = "google_search";
export const SOURCE_TYPE_GOOGLE_SEARCH_AI_OVERVIEW =
  "google_search_ai_overview_follow_up";

export const AI_OVERVIEW_FOLLOW_UP_SELECTION_WEIGHT = 1.4;

export function wrapAiOverviewFollowUpSerpPayload(
  serpPayload: unknown,
): Record<string, unknown> {
  const base =
    serpPayload && typeof serpPayload === "object"
      ? { ...(serpPayload as Record<string, unknown>) }
      : {};
  return {
    ...base,
    [SERP_PAYLOAD_AI_OVERVIEW_FOLLOW_UP_KEY]: true,
  };
}

export function isAiOverviewFollowUpSerpPayload(payload: unknown): boolean {
  return (
    !!payload &&
    typeof payload === "object" &&
    (payload as Record<string, unknown>)[SERP_PAYLOAD_AI_OVERVIEW_FOLLOW_UP_KEY] ===
      true
  );
}

function serpRowIsAiOverviewFollowUp(row: unknown): boolean {
  return (
    !!row &&
    typeof row === "object" &&
    (row as Record<string, unknown>)[SERP_ROW_AI_OVERVIEW_FOLLOW_UP_KEY] === true
  );
}

function tagSerpRowAsAiOverviewFollowUp(row: unknown): unknown {
  if (!row || typeof row !== "object") {
    return row;
  }
  return {
    ...(row as Record<string, unknown>),
    [SERP_ROW_AI_OVERVIEW_FOLLOW_UP_KEY]: true,
  };
}

function publisherName(
  source: z.infer<typeof serpNewsItemSchema>["source"],
): string | undefined {
  if (typeof source === "string" && source.trim()) {
    return source.trim();
  }
  if (source && typeof source === "object" && typeof source.name === "string") {
    return source.name.trim() || undefined;
  }
  return undefined;
}

function parsePublishedAtIso(
  item: z.infer<typeof serpNewsItemSchema>,
): string | undefined {
  const raw = item.iso_date ?? item.published_at ?? item.date;
  if (!raw?.trim()) {
    return undefined;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

function canonicalKey(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    return parsed.toString();
  } catch {
    return null;
  }
}

function toLink(
  item: z.infer<typeof serpNewsItemSchema>,
  sourceType: string,
  options?: { fromAiOverviewFollowUp?: boolean },
): Omit<NormalizedArticleLink, "index"> | null {
  const link = item.link?.trim();
  if (!link) {
    return null;
  }
  const url = canonicalKey(link);
  if (!url) {
    return null;
  }

  const fromAiOverviewFollowUp =
    options?.fromAiOverviewFollowUp === true ||
    serpRowIsAiOverviewFollowUp(item);
  const resolvedSourceType = fromAiOverviewFollowUp
    ? SOURCE_TYPE_GOOGLE_SEARCH_AI_OVERVIEW
    : sourceType;

  const serpImageUrl = extractSerpRowImageUrl(item);

  const parsed = normalizedArticleLinkSchema.omit({ index: true }).safeParse({
    url,
    title: item.title?.trim() || undefined,
    snippet: item.snippet?.trim() || undefined,
    source: publisherName(item.source),
    sourceType: resolvedSourceType,
    publishedAt: parsePublishedAtIso(item),
    fromAiOverviewFollowUp: fromAiOverviewFollowUp || undefined,
    selectionWeight: fromAiOverviewFollowUp
      ? AI_OVERVIEW_FOLLOW_UP_SELECTION_WEIGHT
      : undefined,
    imageUrl: serpImageUrl,
  });
  return parsed.success ? parsed.data : null;
}

function extractNewsResults(payload: unknown): z.infer<typeof serpNewsItemSchema>[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const news = (payload as { news_results?: unknown }).news_results;
  if (!Array.isArray(news)) {
    return [];
  }
  const rows: z.infer<typeof serpNewsItemSchema>[] = [];
  for (const row of news) {
    const parsed = serpNewsItemSchema.safeParse(row);
    if (parsed.success) {
      rows.push(parsed.data);
    }
  }
  return rows;
}

function collectAiOverviewTextParts(value: unknown, parts: string[]): void {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      parts.push(trimmed);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of ["snippet", "text", "title", "answer"]) {
    collectAiOverviewTextParts(record[key], parts);
  }
  if (Array.isArray(record.text_blocks)) {
    for (const block of record.text_blocks) {
      collectAiOverviewTextParts(block, parts);
    }
  }
  if (Array.isArray(record.list)) {
    for (const item of record.list) {
      collectAiOverviewTextParts(item, parts);
    }
  }
  if (record.ai_overview) {
    collectAiOverviewTextParts(record.ai_overview, parts);
  }
}

/** Plain text from `searchGoogle` `ai_overview` for LLM follow-up query generation. */
export function extractAiOverviewTextFromSerpPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const aiOverview = (payload as { ai_overview?: unknown }).ai_overview;
  if (!aiOverview) {
    return null;
  }
  const parts: string[] = [];
  collectAiOverviewTextParts(aiOverview, parts);
  const unique = [...new Set(parts)];
  const text = unique.join("\n\n").trim();
  return text.length > 0 ? text : null;
}

export function serpPayloadHasAiOverview(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  return (payload as { ai_overview?: unknown }).ai_overview != null;
}

/** Merge news/organic hits from extra `searchGoogle` calls into the base payload. */
/** Concatenate news/organic arrays from multiple Serp JSON payloads. */
export function mergeSerpPayloads(
  basePayload: unknown,
  extraPayload: unknown,
): Record<string, unknown> {
  const base =
    basePayload && typeof basePayload === "object"
      ? { ...(basePayload as Record<string, unknown>) }
      : {};

  const news = Array.isArray(base.news_results)
    ? [...(base.news_results as unknown[])]
    : [];
  const organic = Array.isArray(base.organic_results)
    ? [...(base.organic_results as unknown[])]
    : [];

  if (extraPayload && typeof extraPayload === "object") {
    const extra = extraPayload as {
      news_results?: unknown;
      organic_results?: unknown;
      video_results?: unknown;
    };
    if (Array.isArray(extra.news_results)) {
      news.push(...extra.news_results);
    }
    if (Array.isArray(extra.organic_results)) {
      organic.push(...extra.organic_results);
    }
    if (Array.isArray(extra.video_results)) {
      const existingVideos = Array.isArray(base.video_results)
        ? [...(base.video_results as unknown[])]
        : [];
      base.video_results = [...existingVideos, ...extra.video_results];
    }
  }

  return {
    ...base,
    news_results: news,
    ...(organic.length > 0 ? { organic_results: organic } : {}),
  };
}

export function appendGoogleSearchSerpResults(
  basePayload: unknown,
  extraPayloads: unknown[],
): Record<string, unknown> {
  const base =
    basePayload && typeof basePayload === "object"
      ? { ...(basePayload as Record<string, unknown>) }
      : {};

  const news = Array.isArray(base.news_results)
    ? [...(base.news_results as unknown[])]
    : [];
  const organic = Array.isArray(base.organic_results)
    ? [...(base.organic_results as unknown[])]
    : [];

  let mergedFollowUp = false;

  for (const payload of extraPayloads) {
    if (!payload || typeof payload !== "object") {
      continue;
    }
    const record = payload as {
      news_results?: unknown;
      organic_results?: unknown;
    };
    const fromFollowUp = isAiOverviewFollowUpSerpPayload(payload);
    if (fromFollowUp) {
      mergedFollowUp = true;
    }
    if (Array.isArray(record.news_results)) {
      for (const row of record.news_results) {
        news.push(fromFollowUp ? tagSerpRowAsAiOverviewFollowUp(row) : row);
      }
    }
    if (Array.isArray(record.organic_results)) {
      for (const row of record.organic_results) {
        organic.push(fromFollowUp ? tagSerpRowAsAiOverviewFollowUp(row) : row);
      }
    }
  }

  return {
    ...base,
    news_results: news,
    ...(organic.length > 0 ? { organic_results: organic } : {}),
    ...(mergedFollowUp ? { [SERP_PAYLOAD_AI_OVERVIEW_FOLLOW_UP_KEY]: true } : {}),
  };
}

function urlKeysFromGoogleSearchPayload(payload: unknown): string[] {
  const keys: string[] = [];
  for (const item of extractNewsResults(payload)) {
    const link = item.link?.trim();
    if (!link) {
      continue;
    }
    const key = canonicalKey(link);
    if (key) {
      keys.push(key);
    }
  }
  for (const organic of extractOrganicResults(payload)) {
    const link = organic.link?.trim();
    if (!link) {
      continue;
    }
    const key = canonicalKey(link);
    if (key) {
      keys.push(key);
    }
  }
  return keys;
}

/** URLs that appear only in AI-overview follow-up Serp payloads (not the base search). */
export function followUpBoostedUrlKeys(
  baseGoogleSearchPayload: unknown,
  followUpPayloads: unknown[],
): Set<string> {
  const base = new Set(urlKeysFromGoogleSearchPayload(baseGoogleSearchPayload));
  const boosted = new Set<string>();
  for (const payload of followUpPayloads) {
    for (const key of urlKeysFromGoogleSearchPayload(payload)) {
      if (!base.has(key)) {
        boosted.add(key);
      }
    }
  }
  return boosted;
}

export function applySelectionWeightBoosts(
  articles: NormalizedArticleLink[],
  boostedUrls: Set<string>,
  weight = AI_OVERVIEW_FOLLOW_UP_SELECTION_WEIGHT,
): NormalizedArticleLink[] {
  if (boostedUrls.size === 0) {
    return articles;
  }
  return articles.map((article) => {
    if (article.fromAiOverviewFollowUp) {
      return article;
    }
    return boostedUrls.has(article.url)
      ? {
          ...article,
          fromAiOverviewFollowUp: true,
          sourceType: SOURCE_TYPE_GOOGLE_SEARCH_AI_OVERVIEW,
          selectionWeight: weight,
        }
      : article;
  });
}

function extractOrganicResults(payload: unknown): z.infer<typeof serpOrganicItemSchema>[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const organic = (payload as { organic_results?: unknown }).organic_results;
  if (!Array.isArray(organic)) {
    return [];
  }
  const rows: z.infer<typeof serpOrganicItemSchema>[] = [];
  for (const row of organic) {
    const parsed = serpOrganicItemSchema.safeParse(row);
    if (parsed.success) {
      rows.push(parsed.data);
    }
  }
  return rows;
}

/** Drop thumbnails / metadata blobs before Inngest persists step output. */
export function slimSerpPayloadForNormalize(payload: unknown): {
  news_results: unknown[];
  organic_results?: unknown[];
  aiOverviewFollowUpSearch?: boolean;
} {
  if (!payload || typeof payload !== "object") {
    return { news_results: [] };
  }

  const record = payload as {
    news_results?: unknown;
    organic_results?: unknown;
  };

  const slimNews = Array.isArray(record.news_results)
    ? record.news_results.slice(0, 15).map(slimSerpNewsRow)
    : [];

  const slimOrganic = Array.isArray(record.organic_results)
    ? record.organic_results.slice(0, 15).map(slimSerpOrganicRow)
    : undefined;

  return {
    news_results: slimNews,
    ...(slimOrganic ? { organic_results: slimOrganic } : {}),
    ...(isAiOverviewFollowUpSerpPayload(payload)
      ? { [SERP_PAYLOAD_AI_OVERVIEW_FOLLOW_UP_KEY]: true }
      : {}),
  };
}

function slimSerpNewsRow(row: unknown) {
  if (!row || typeof row !== "object") {
    return {};
  }
  const item = row as Record<string, unknown>;
  return {
    link: item.link,
    title: item.title,
    snippet: item.snippet,
    date: item.date,
    iso_date: item.iso_date,
    published_at: item.published_at,
    source: item.source,
    thumbnail: item.thumbnail,
    image: item.image,
    imageUrl: item.imageUrl,
    ...(item[SERP_ROW_AI_OVERVIEW_FOLLOW_UP_KEY] === true
      ? { [SERP_ROW_AI_OVERVIEW_FOLLOW_UP_KEY]: true }
      : {}),
  };
}

function slimSerpOrganicRow(row: unknown) {
  if (!row || typeof row !== "object") {
    return {};
  }
  const item = row as Record<string, unknown>;
  return {
    link: item.link,
    title: item.title,
    snippet: item.snippet,
    thumbnail: item.thumbnail,
    image: item.image,
    imageUrl: item.imageUrl,
    ...(item[SERP_ROW_AI_OVERVIEW_FOLLOW_UP_KEY] === true
      ? { [SERP_ROW_AI_OVERVIEW_FOLLOW_UP_KEY]: true }
      : {}),
  };
}

function partitionSearchNewsResults(
  payload: unknown,
): {
  aiOverviewFollowUp: z.infer<typeof serpNewsItemSchema>[];
  standard: z.infer<typeof serpNewsItemSchema>[];
} {
  const aiOverviewFollowUp: z.infer<typeof serpNewsItemSchema>[] = [];
  const standard: z.infer<typeof serpNewsItemSchema>[] = [];
  for (const item of extractNewsResults(payload)) {
    if (serpRowIsAiOverviewFollowUp(item)) {
      aiOverviewFollowUp.push(item);
    } else {
      standard.push(item);
    }
  }
  return { aiOverviewFollowUp, standard };
}

function partitionOrganicResults(
  payload: unknown,
): {
  aiOverviewFollowUp: z.infer<typeof serpOrganicItemSchema>[];
  standard: z.infer<typeof serpOrganicItemSchema>[];
} {
  const aiOverviewFollowUp: z.infer<typeof serpOrganicItemSchema>[] = [];
  const standard: z.infer<typeof serpOrganicItemSchema>[] = [];
  for (const item of extractOrganicResults(payload)) {
    if (serpRowIsAiOverviewFollowUp(item)) {
      aiOverviewFollowUp.push(item);
    } else {
      standard.push(item);
    }
  }
  return { aiOverviewFollowUp, standard };
}

/** Merge top Serp hits from `searchGoogleNews` and `searchGoogle` (news tab). */
export function normalizeSerpArticles(params: {
  googleNewsPayload: unknown;
  googleSearchPayload: unknown;
  limitPerEngine?: number;
}): NormalizedArticleLink[] {
  const limit = params.limitPerEngine ?? 10;
  const seen = new Set<string>();
  const merged: Omit<NormalizedArticleLink, "index">[] = [];

  const append = (candidate: Omit<NormalizedArticleLink, "index"> | null) => {
    if (!candidate || seen.has(candidate.url)) {
      return;
    }
    seen.add(candidate.url);
    merged.push(candidate);
  };

  for (const item of extractNewsResults(params.googleNewsPayload).slice(0, limit)) {
    append(toLink(item, "google_news"));
  }

  const searchPartitions = partitionSearchNewsResults(params.googleSearchPayload);
  const organicPartitions = partitionOrganicResults(params.googleSearchPayload);

  let searchSlots = limit;

  for (const item of searchPartitions.aiOverviewFollowUp) {
    if (searchSlots <= 0) {
      break;
    }
    append(toLink(item, SOURCE_TYPE_GOOGLE_SEARCH, { fromAiOverviewFollowUp: true }));
    searchSlots -= 1;
  }

  for (const item of searchPartitions.standard) {
    if (searchSlots <= 0) {
      break;
    }
    append(toLink(item, SOURCE_TYPE_GOOGLE_SEARCH));
    searchSlots -= 1;
  }

  for (const organic of organicPartitions.aiOverviewFollowUp) {
    if (searchSlots <= 0) {
      break;
    }
    append(
      toLink(
        {
          link: organic.link,
          title: organic.title,
          snippet: organic.snippet,
          [SERP_ROW_AI_OVERVIEW_FOLLOW_UP_KEY]: true,
        },
        SOURCE_TYPE_GOOGLE_SEARCH,
        { fromAiOverviewFollowUp: true },
      ),
    );
    searchSlots -= 1;
  }

  for (const organic of organicPartitions.standard) {
    if (searchSlots <= 0) {
      break;
    }
    append(
      toLink(
        {
          link: organic.link,
          title: organic.title,
          snippet: organic.snippet,
        },
        SOURCE_TYPE_GOOGLE_SEARCH,
      ),
    );
    searchSlots -= 1;
  }

  return merged.map((row, index) => {
    const parsed = normalizedArticleLinkSchema.safeParse({ ...row, index });
    if (!parsed.success) {
      throw new Error(
        `Failed to normalize article at index ${index}: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  });
}

/** Inngest step outputs must be plain JSON (no Date, Buffer, etc.). */
export function toJsonSafeStepOutput<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function addDaysIsoDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

function utcCalendarDay(isoTimestamp: string): string | null {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Matches the news request calendar day used in search planning (`after:DATE before:DATE+1`).
 * Uses `publishedAt` ISO timestamps (not URL date strings).
 * Accepts the request UTC day, or late-evening UTC on the previous calendar day (timezone spillover).
 */
export function articlePublishedMatchesRequestDate(
  publishedAtIso: string,
  requestDateIso: string,
): boolean {
  const pubDay = utcCalendarDay(publishedAtIso);
  if (!pubDay) {
    return false;
  }
  if (pubDay === requestDateIso) {
    return true;
  }
  const previousDay = addDaysIsoDate(requestDateIso, -1);
  if (pubDay === previousDay) {
    const published = new Date(publishedAtIso);
    return published.getUTCHours() >= 18;
  }
  return false;
}

const TRADING_RECOMMENDATION_PATTERNS: RegExp[] = [
  /\bstock\s+recommendations?\b/i,
  /\bmarket\s+trading\s+guide\b/i,
  /\btrading\s+guide\b/i,
  /\bstocks?\s+to\s+(?:buy|sell|watch)\b/i,
  /\bstock\s+picks?\b/i,
  /\bbuy\s+(?:at|above|below|price)\b/i,
  /\btarget\s+(?:price|of)\b/i,
  /\bstop[\s-]?loss\b/i,
  /\bintraday\s+(?:call|trade|pick)?\b/i,
  /\boptions?\s+calls?\b/i,
  /\bmultibagger\b/i,
  /\bportfolio\s+(?:advice|pick|recommend)/i,
  /\btechnical\s+(?:trading\s+)?setups?\b/i,
  /\b(?:top\s+)?(?:3|three|5|five)\s+stock\s+recommendations?\b/i,
  /\b(?:buy|sell)\s+(?:call|recommendation)\b/i,
];

/** Heuristic filter for trading tips / buy-sell-call pages (title, snippet, scrape). */
export function isTradingRecommendationArticle(input: {
  title?: string | null;
  snippet?: string | null;
  scrapedContent?: string | null;
}): boolean {
  const title = input.title?.trim() ?? "";
  const snippet = input.snippet?.trim() ?? "";
  const scrapeHead = input.scrapedContent?.trim().slice(0, 4000) ?? "";
  const haystack = [title, snippet, scrapeHead].filter(Boolean).join("\n");
  if (!haystack) {
    return false;
  }
  return TRADING_RECOMMENDATION_PATTERNS.some((pattern) => pattern.test(haystack));
}

/**
 * Keep articles whose Serp `publishedAt` matches the request day (or undated rows).
 * Drops out-of-window dated hits (e.g. next-day publish for a prior request date).
 */
export function filterArticlesNearRequestDate(
  articles: NormalizedArticleLink[],
  requestDateIso: string,
  _windowDays?: number,
): NormalizedArticleLink[] {
  void _windowDays;
  const filtered = articles.filter((article) => {
    if (!article.publishedAt) {
      return true;
    }
    return articlePublishedMatchesRequestDate(
      article.publishedAt,
      requestDateIso,
    );
  });

  return filtered.map((article, index) => ({ ...article, index }));
}

export function excludeTradingRecommendationArticles<
  T extends { title?: string; snippet?: string },
>(articles: T[]): T[] {
  return articles.filter(
    (article) =>
      !isTradingRecommendationArticle({
        title: article.title,
        snippet: article.snippet,
      }),
  );
}
