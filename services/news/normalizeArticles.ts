import { z } from "zod";

const serpNewsItemSchema = z.looseObject({
  link: z.string().optional(),
  title: z.string().optional(),
  snippet: z.string().optional(),
  date: z.string().optional(),
  iso_date: z.string().optional(),
  published_at: z.string().optional(),
  source: z
    .union([z.string(), z.looseObject({ name: z.string().optional() })])
    .optional(),
});

const serpOrganicItemSchema = z.looseObject({
  link: z.string().optional(),
  title: z.string().optional(),
  snippet: z.string().optional(),
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
});

export type NormalizedArticleLink = z.infer<typeof normalizedArticleLinkSchema>;

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
): Omit<NormalizedArticleLink, "index"> | null {
  const link = item.link?.trim();
  if (!link) {
    return null;
  }
  const url = canonicalKey(link);
  if (!url) {
    return null;
  }

  const parsed = normalizedArticleLinkSchema.omit({ index: true }).safeParse({
    url,
    title: item.title?.trim() || undefined,
    snippet: item.snippet?.trim() || undefined,
    source: publisherName(item.source),
    sourceType,
    publishedAt: parsePublishedAtIso(item),
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
  };
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

  const searchNews = extractNewsResults(params.googleSearchPayload).slice(0, limit);
  for (const item of searchNews) {
    append(toLink(item, "google_search"));
  }

  if (searchNews.length < limit) {
    const remaining = limit - searchNews.length;
    for (const organic of extractOrganicResults(params.googleSearchPayload).slice(
      0,
      remaining,
    )) {
      append(
        toLink(
          {
            link: organic.link,
            title: organic.title,
            snippet: organic.snippet,
          },
          "google_search",
        ),
      );
    }
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

/**
 * Prefer articles near the requested calendar day; keep undated rows.
 * Reduces stale Serp hits and shrinks the selector LLM payload.
 */
export function filterArticlesNearRequestDate(
  articles: NormalizedArticleLink[],
  requestDateIso: string,
  windowDays = 3,
): NormalizedArticleLink[] {
  const requestMs = Date.parse(`${requestDateIso}T12:00:00.000Z`);
  if (Number.isNaN(requestMs)) {
    return articles;
  }

  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const filtered = articles.filter((article) => {
    if (!article.publishedAt) {
      return true;
    }
    const publishedMs = Date.parse(article.publishedAt);
    if (Number.isNaN(publishedMs)) {
      return true;
    }
    return Math.abs(publishedMs - requestMs) <= windowMs;
  });

  const pool = filtered.length > 0 ? filtered : articles;
  return pool.map((article, index) => ({ ...article, index }));
}
