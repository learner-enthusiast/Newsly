import { createHash } from "node:crypto";
import {
  canonicalResearchUrl,
  mergeNormalizedSerpHits,
  normalizeSerpEnginePayload,
  type NormalizedSerpHit,
} from "@/services/chat/normalizeSerpResults";
import { extractAiOverviewTextFromSerpPayload } from "@/services/news/normalizeArticles";
import type { StockResearchToolExecutionResult } from "@/services/stockResearch/executeStockResearchTools";

/** Serp tools whose results are article/web links worth scraping. */
const LINK_SERP_TOOLS = new Set([
  "searchGoogle",
  "searchGoogleNews",
  "searchGoogleNewsTab",
  "searchGoogleFinance",
  "searchGoogleAiMode",
]);

const UNSCRAPABLE_HOSTS = [
  "youtube.com",
  "youtu.be",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "reddit.com",
  "linkedin.com",
  "google.com",
];

const MAX_LINK_CANDIDATES = 40;
const MAX_SERP_SUMMARY_CHARS = 4_000;

function isScrapableUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return !UNSCRAPABLE_HOSTS.some(
      (blocked) => host === blocked || host.endsWith(`.${blocked}`),
    );
  } catch {
    return false;
  }
}

/** Deduped, scrapable article links from successful Serp tool results. */
export function normalizeStockResearchSerpLinks(
  serpResults: StockResearchToolExecutionResult[],
  maxTotal = MAX_LINK_CANDIDATES,
): NormalizedSerpHit[] {
  const hits = serpResults
    .filter((row) => row.ok && LINK_SERP_TOOLS.has(row.tool))
    .flatMap((row) => normalizeSerpEnginePayload(row.rawData, row.tool, 15))
    .filter((hit) => isScrapableUrl(hit.url));
  return mergeNormalizedSerpHits(hits, maxTotal);
}

/** AI overview (Google) and AI mode text blocks, as plain text leads. */
export function extractStockResearchSerpSummaries(
  serpResults: StockResearchToolExecutionResult[],
): string[] {
  const summaries: string[] = [];
  for (const row of serpResults) {
    if (!row.ok || !row.rawData || typeof row.rawData !== "object") {
      continue;
    }
    const payload =
      row.tool === "searchGoogleAiMode"
        ? { ai_overview: row.rawData }
        : row.rawData;
    const text = extractAiOverviewTextFromSerpPayload(payload);
    if (text) {
      summaries.push(
        `[${row.tool}] ${text.slice(0, MAX_SERP_SUMMARY_CHARS)}`,
      );
    }
  }
  return summaries;
}

/** Stable per-URL hash so re-scraping the same page upserts one resource row. */
export function firecrawlContentHash(url: string): string {
  const key = canonicalResearchUrl(url) ?? url;
  return createHash("sha256").update(`FIRECRAWL:${key}`).digest("hex").slice(0, 40);
}

const MAX_ARRAY_ITEMS = 60;
const MAX_STRING_CHARS = 2_000;
const MAX_DEPTH = 8;

function pruneForPrompt(value: unknown, depth: number): unknown {
  if (typeof value === "string") {
    return value.length > MAX_STRING_CHARS
      ? `${value.slice(0, MAX_STRING_CHARS)}…`
      : value;
  }
  if (value == null || typeof value !== "object") {
    return value;
  }
  if (depth >= MAX_DEPTH) {
    return "[truncated]";
  }
  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => pruneForPrompt(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`[${value.length - MAX_ARRAY_ITEMS} more items omitted]`);
    }
    return items;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      pruneForPrompt(item, depth + 1),
    ]),
  );
}

/**
 * JSON text of a tool response sized for an LLM prompt: long arrays and strings
 * are cut first, then the whole text is capped at `maxChars`.
 */
export function compactJsonForPrompt(value: unknown, maxChars = 12_000): string {
  const text = JSON.stringify(pruneForPrompt(value, 0)) ?? "null";
  return text.length > maxChars ? `${text.slice(0, maxChars)}…[truncated]` : text;
}
