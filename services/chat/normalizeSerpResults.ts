import { z } from "zod";

const looseRow = z.looseObject({
  link: z.string().optional(),
  url: z.string().optional(),
  title: z.string().optional(),
  snippet: z.string().optional(),
  date: z.string().optional(),
  iso_date: z.string().optional(),
  published_at: z.string().optional(),
  source: z
    .union([z.string(), z.looseObject({ name: z.string().optional() })])
    .optional(),
});

export const normalizedSerpHitSchema = z.object({
  url: z.url(),
  title: z.string().min(1).optional(),
  snippet: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
  date: z.string().min(1).optional(),
  engine: z.string().min(1),
  index: z.number().int().min(0),
});

export type NormalizedSerpHit = z.infer<typeof normalizedSerpHitSchema>;

function publisherName(
  source: z.infer<typeof looseRow>["source"],
): string | undefined {
  if (typeof source === "string" && source.trim()) {
    return source.trim();
  }
  if (source && typeof source === "object" && typeof source.name === "string") {
    return source.name.trim() || undefined;
  }
  return undefined;
}

function canonicalUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw.trim());
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

/** Shared URL identity for Serp hits and ResearchSource deduplication. */
export function canonicalResearchUrl(raw: string): string | null {
  return canonicalUrl(raw);
}

function rowUrl(row: z.infer<typeof looseRow>): string | null {
  const raw = row.link?.trim() || row.url?.trim();
  if (!raw) {
    return null;
  }
  return canonicalUrl(raw);
}

function rowDate(row: z.infer<typeof looseRow>): string | undefined {
  const raw = row.iso_date ?? row.published_at ?? row.date;
  return raw?.trim() || undefined;
}

function collectArray(payload: unknown, key: string): unknown[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const value = (payload as Record<string, unknown>)[key];
  return Array.isArray(value) ? value : [];
}

function hitsFromPayload(payload: unknown, engine: string, limit: number) {
  const keys = [
    "news_results",
    "organic_results",
    "top_stories",
    "discover_more",
  ];
  const rows: z.infer<typeof looseRow>[] = [];
  for (const key of keys) {
    for (const item of collectArray(payload, key)) {
      const parsed = looseRow.safeParse(item);
      if (parsed.success) {
        rows.push(parsed.data);
      }
    }
  }

  const seen = new Set<string>();
  const hits: Omit<NormalizedSerpHit, "index">[] = [];

  for (const row of rows) {
    if (hits.length >= limit) {
      break;
    }
    const url = rowUrl(row);
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    hits.push({
      url,
      title: row.title?.trim() || undefined,
      snippet: row.snippet?.trim() || undefined,
      source: publisherName(row.source),
      date: rowDate(row),
      engine,
    });
  }

  return hits.map((hit, index) => normalizedSerpHitSchema.parse({ ...hit, index }));
}

/** Normalize up to `limitPerEngine` link rows from one Serp engine response. */
export function normalizeSerpEnginePayload(
  payload: unknown,
  engine: string,
  limitPerEngine = 20,
): NormalizedSerpHit[] {
  return hitsFromPayload(payload, engine, limitPerEngine);
}

/** Merge hits from multiple Serp calls (dedupe by URL, preserve first engine). */
export function mergeNormalizedSerpHits(
  batches: NormalizedSerpHit[],
  maxTotal = 40,
): NormalizedSerpHit[] {
  const seen = new Set<string>();
  const merged: NormalizedSerpHit[] = [];

  for (const hit of batches) {
    if (merged.length >= maxTotal) {
      break;
    }
    if (seen.has(hit.url)) {
      continue;
    }
    seen.add(hit.url);
    merged.push({ ...hit, index: merged.length });
  }

  return merged;
}
