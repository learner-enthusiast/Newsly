import { canonicalResearchUrl } from "@/services/chat/normalizeSerpResults";

export type KnownSourceIndex = {
  urlKeys: Set<string>;
  youtubeVideoIds: Set<string>;
};

export function buildKnownSourceIndex(
  sources: Array<{ url: string; sourceType: string }>,
): KnownSourceIndex {
  const urlKeys = new Set<string>();
  const youtubeVideoIds = new Set<string>();

  for (const source of sources) {
    const key = canonicalResearchUrl(source.url);
    if (key) {
      urlKeys.add(key);
    }
    const videoId = extractYoutubeVideoId(source.url);
    if (videoId) {
      youtubeVideoIds.add(videoId);
    }
  }

  return { urlKeys, youtubeVideoIds };
}

export function extractYoutubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    const fromQuery = parsed.searchParams.get("v")?.trim();
    if (fromQuery) {
      return fromQuery;
    }
    if (parsed.hostname.includes("youtu.be")) {
      const slug = parsed.pathname.replace(/^\//, "").trim();
      return slug || null;
    }
  } catch {
    return null;
  }
  return null;
}

export function isKnownArticleUrl(
  url: string,
  known: KnownSourceIndex,
): boolean {
  const key = canonicalResearchUrl(url);
  return key != null && known.urlKeys.has(key);
}

export function isKnownYoutubeVideo(
  videoId: string,
  known: KnownSourceIndex,
): boolean {
  return known.youtubeVideoIds.has(videoId);
}

export function partitionNewNormalizedArticles<
  T extends { url: string },
>(articles: T[], known: KnownSourceIndex): {
  newArticles: T[];
  skippedKnown: number;
} {
  let skippedKnown = 0;
  const newArticles: T[] = [];
  for (const article of articles) {
    if (isKnownArticleUrl(article.url, known)) {
      skippedKnown += 1;
      continue;
    }
    newArticles.push(article);
  }
  return { newArticles, skippedKnown };
}
