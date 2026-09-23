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

export const normalizedArticleLinkSchema = z.object({
  url: z.url(),
  title: z.string().min(1).optional(),
  snippet: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
  sourceType: z.string().min(1),
  publishedAt: z.coerce.date().optional(),
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

function parsePublishedAt(item: z.infer<typeof serpNewsItemSchema>): Date | undefined {
  const raw = item.iso_date ?? item.published_at ?? item.date;
  if (!raw?.trim()) {
    return undefined;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
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

  return normalizedArticleLinkSchema
    .omit({ index: true })
    .parse({
      url,
      title: item.title?.trim() || undefined,
      snippet: item.snippet?.trim() || undefined,
      source: publisherName(item.source),
      sourceType,
      publishedAt: parsePublishedAt(item),
    });
}

function extractNewsResults(payload: unknown): z.infer<typeof serpNewsItemSchema>[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const news = (payload as { news_results?: unknown }).news_results;
  if (!Array.isArray(news)) {
    return [];
  }
  return news.map((row) => serpNewsItemSchema.parse(row));
}

function extractOrganicResults(payload: unknown): z.infer<typeof serpOrganicItemSchema>[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const organic = (payload as { organic_results?: unknown }).organic_results;
  if (!Array.isArray(organic)) {
    return [];
  }
  return organic.map((row) => serpOrganicItemSchema.parse(row));
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

  return merged.map((row, index) =>
    normalizedArticleLinkSchema.parse({ ...row, index }),
  );
}
