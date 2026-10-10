/**
 * Direct publisher feeds (RSS / Google News sitemaps) for the news pipeline.
 *
 * Sources come from `config/newsSources.json` (region → list), so feeds can be
 * added or switched off without code changes. Every item is normalized to the
 * same `NormalizedArticleLink` shape the Serp path produces, tagged with its
 * region and kept only when published inside the requested time window.
 *
 * Latency: all sources are fetched in parallel; each feed URL has a hard
 * timeout (default 5s) and a failing/slow source is skipped, never awaited.
 * Responses are cached in-process for a few minutes.
 */

import sourcesConfig from "@/config/newsSources.json";
import { canonicalResearchUrl } from "@/services/chat/normalizeSerpResults";
import type { NormalizedArticleLink } from "@/services/news/normalizeArticles";
import { z } from "zod";

export const FEED_FETCH_TIMEOUT_MS = 5_000;
const FEED_CACHE_TTL_MS = 5 * 60_000;
const MAX_ITEMS_PER_SOURCE = 40;
const SNIPPET_MAX_CHARS = 300;
const FEED_USER_AGENT =
  "Mozilla/5.0 (compatible; DainikSamacharBot/1.0; +https://dainiksamachar.app)";

export type NewsSourceRegion = "india" | "world";

const newsFeedSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["rss", "news-sitemap"]),
  urls: z.array(z.url()).min(1),
  pathIncludes: z.array(z.string().min(1)).optional(),
  enabled: z.boolean().default(true),
  disabledReason: z.string().optional(),
});

const newsSourcesConfigSchema = z.object({
  india: z.array(newsFeedSourceSchema).default([]),
  world: z.array(newsFeedSourceSchema).default([]),
});

export type NewsFeedSource = z.infer<typeof newsFeedSourceSchema>;

export type FeedSourceStats = {
  id: string;
  region: NewsSourceRegion;
  ok: boolean;
  fetched: number;
  inWindow: number;
  durationMs: number;
  error?: string;
};

export type TimeWindow = { start: Date; end: Date };

let parsedConfig: z.infer<typeof newsSourcesConfigSchema> | null = null;

export function listNewsFeedSources(region: NewsSourceRegion): NewsFeedSource[] {
  parsedConfig ??= newsSourcesConfigSchema.parse(sourcesConfig);
  return parsedConfig[region].filter((source) => source.enabled);
}

const feedCache = new Map<string, { at: number; body: string }>();

async function fetchFeedText(url: string, timeoutMs: number): Promise<string> {
  const cached = feedCache.get(url);
  if (cached && Date.now() - cached.at < FEED_CACHE_TTL_MS) {
    return cached.body;
  }
  const response = await fetch(url, {
    headers: {
      "User-Agent": FEED_USER_AGENT,
      Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const body = await response.text();
  feedCache.set(url, { at: Date.now(), body });
  return body;
}

const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    }
    return ENTITY_MAP[code.toLowerCase()] ?? match;
  });
}

function cleanText(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const text = decodeEntities(
    raw
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

function tagValue(block: string, tag: string): string | undefined {
  const escaped = tag.replace(":", "\\:");
  const match = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`, "i").exec(block);
  return match?.[1];
}

function attrValue(block: string, tag: string, attr: string): string | undefined {
  const escaped = tag.replace(":", "\\:");
  const match = new RegExp(`<${escaped}\\b[^>]*\\b${attr}="([^"]+)"`, "i").exec(block);
  return match?.[1];
}

type RawFeedItem = {
  url: string;
  title?: string;
  snippet?: string;
  publishedAt?: string;
  imageUrl?: string;
};

function parseRss(xml: string): RawFeedItem[] {
  const items: RawFeedItem[] = [];
  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = match[1]!;
    const url = cleanText(tagValue(block, "link")) ?? cleanText(tagValue(block, "guid"));
    if (!url) {
      continue;
    }
    items.push({
      url,
      title: cleanText(tagValue(block, "title")),
      snippet: cleanText(tagValue(block, "description")),
      publishedAt: cleanText(tagValue(block, "pubDate") ?? tagValue(block, "dc:date")),
      imageUrl:
        attrValue(block, "media:content", "url") ??
        attrValue(block, "media:thumbnail", "url") ??
        attrValue(block, "enclosure", "url"),
    });
  }
  return items;
}

function parseNewsSitemap(xml: string): RawFeedItem[] {
  const items: RawFeedItem[] = [];
  for (const match of xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
    const block = match[1]!;
    const url = cleanText(tagValue(block, "loc"));
    if (!url) {
      continue;
    }
    items.push({
      url,
      title: cleanText(tagValue(block, "news:title")),
      publishedAt: cleanText(tagValue(block, "news:publication_date")),
      imageUrl: cleanText(tagValue(block, "image:loc")),
    });
  }
  return items;
}

/** Canonical URL without feed tracking params (utm_*, at_*, ref). */
function normalizeFeedUrl(raw: string): string | null {
  const canonical = canonicalResearchUrl(raw);
  if (!canonical) {
    return null;
  }
  const url = new URL(canonical);
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|at_)/i.test(key) || key === "ref" || key === "cmpid") {
      url.searchParams.delete(key);
    }
  }
  return url.toString();
}

function toIsoDate(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

async function fetchSource(
  source: NewsFeedSource,
  region: NewsSourceRegion,
  window: TimeWindow,
  timeoutMs: number,
): Promise<{ items: Omit<NormalizedArticleLink, "index">[]; stats: FeedSourceStats }> {
  const started = Date.now();
  const settled = await Promise.allSettled(
    source.urls.map((url) => fetchFeedText(url, timeoutMs)),
  );
  const bodies = settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  const firstError = settled.find((result) => result.status === "rejected") as
    | PromiseRejectedResult
    | undefined;

  const raw = bodies.flatMap((body) =>
    source.kind === "rss" ? parseRss(body) : parseNewsSitemap(body),
  );
  const seen = new Set<string>();
  const startMs = window.start.getTime();
  const endMs = window.end.getTime();
  let fetched = 0;
  const items: Omit<NormalizedArticleLink, "index">[] = [];

  for (const item of raw) {
    const url = normalizeFeedUrl(item.url);
    if (!url || seen.has(url)) {
      continue;
    }
    if (source.pathIncludes && !source.pathIncludes.some((part) => url.includes(part))) {
      continue;
    }
    seen.add(url);
    fetched += 1;
    const publishedAt = toIsoDate(item.publishedAt);
    const publishedMs = publishedAt ? Date.parse(publishedAt) : null;
    // Feed items without a date cannot be placed in the window; skip them.
    if (publishedMs == null || publishedMs < startMs || publishedMs >= endMs) {
      continue;
    }
    if (!item.title) {
      continue;
    }
    items.push({
      url,
      title: item.title,
      ...(item.snippet ? { snippet: item.snippet.slice(0, SNIPPET_MAX_CHARS) } : {}),
      source: source.name,
      sourceType: `feed:${source.id}`,
      publishedAt,
      ...(item.imageUrl && canonicalResearchUrl(item.imageUrl)
        ? { imageUrl: item.imageUrl }
        : {}),
    });
  }

  // Newest first, then cap so one busy feed cannot flood the candidate pool.
  items.sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!));
  const capped = items.slice(0, MAX_ITEMS_PER_SOURCE);

  return {
    items: capped,
    stats: {
      id: source.id,
      region,
      ok: bodies.length > 0,
      fetched,
      inWindow: capped.length,
      durationMs: Date.now() - started,
      ...(bodies.length === 0 && firstError
        ? {
            error:
              firstError.reason instanceof Error
                ? firstError.reason.message
                : String(firstError.reason),
          }
        : {}),
    },
  };
}

/**
 * Fetch every enabled source for a region in parallel. Returns one list per
 * source (newest first) so callers can interleave sources fairly.
 */
export async function fetchRegionFeedCandidates(input: {
  region: NewsSourceRegion;
  window: TimeWindow;
  timeoutMs?: number;
}): Promise<{
  lists: Array<Omit<NormalizedArticleLink, "index">[]>;
  stats: FeedSourceStats[];
}> {
  const sources = listNewsFeedSources(input.region);
  const results = await Promise.all(
    sources.map((source) =>
      fetchSource(
        source,
        input.region,
        input.window,
        input.timeoutMs ?? FEED_FETCH_TIMEOUT_MS,
      ),
    ),
  );
  return {
    lists: results.map((result) => result.items),
    stats: results.map((result) => result.stats),
  };
}
