/**
 * External calls for the video script pipeline. Every call goes through
 * `callTool` (cache, retries, per-run budget) and returns `null` / `[]` on failure.
 *
 * SerpApi engines and fields follow the docs:
 * - google_news: news_results[].{title, link, source.name, date, iso_date}
 *   (`q` cannot be combined with `so`, so results are sorted by iso_date here)
 * - google_images / google_images_light: images_results[].{title, link, original, thumbnail, source}
 * - bing_images: images_results[].{title, link, original, thumbnail, source, domain}
 */

import { callTool, type CallBudget } from "@/clients/callTool";
import {
  isPexelsConfigured,
  pexelsClient,
  type PexelsSearchParams,
} from "@/clients/pexelsClient";
import { z } from "zod";

const DAY_MS = 24 * 60 * 60 * 1000;
export const SCRAPE_CACHE_TTL_MS = 7 * DAY_MS;
export const NEWS_SEARCH_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const IMAGE_SEARCH_CACHE_TTL_MS = 7 * DAY_MS;

export type NewsHit = {
  url: string;
  title: string;
  source: string | null;
  isoDate: string | null;
};

export type ImageEngine = "google_images" | "google_images_light" | "bing_images";

export type ImageHit = {
  source: ImageEngine | "pexels";
  url: string;
  previewUrl: string | null;
  pageUrl: string | null;
  title: string | null;
  site: string | null;
  width: number | null;
  height: number | null;
};

export type VideoHit = {
  source: "pexels";
  url: string;
  previewUrl: string | null;
  pageUrl: string;
  title: string | null;
  durationSec: number | null;
};

export type VideoTools = {
  scrapeMarkdown(url: string, budget: CallBudget): Promise<string | null>;
  searchNews(
    q: string,
    budget: CallBudget,
  ): Promise<NewsHit[]>;
  searchImages(
    engine: ImageEngine,
    q: string,
    budget: CallBudget,
  ): Promise<ImageHit[]>;
  /** Empty when `PEXELS_API_KEY` is not set. */
  searchPexelsPhotos(q: string, orientation: PexelsSearchParams["orientation"], budget: CallBudget): Promise<ImageHit[]>;
  searchPexelsVideos(q: string, orientation: PexelsSearchParams["orientation"], budget: CallBudget): Promise<VideoHit[]>;
  pexelsEnabled(): boolean;
};

const httpUrl = z
  .string()
  .refine((value) => /^https?:\/\//i.test(value), "not an http(s) url");

const newsItemSchema = z.looseObject({
  link: httpUrl,
  title: z.string().min(1),
  source: z.looseObject({ name: z.string().nullish() }).nullish(),
  iso_date: z.string().nullish(),
});

const imageItemSchema = z.looseObject({
  original: httpUrl,
  thumbnail: z.string().nullish(),
  link: z.string().nullish(),
  title: z.string().nullish(),
  source: z.string().nullish(),
  domain: z.string().nullish(),
  original_width: z.number().nullish(),
  original_height: z.number().nullish(),
});

function parseList<T>(value: unknown, schema: z.ZodType<T>): T[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const rows: T[] = [];
  for (const row of value) {
    const parsed = schema.safeParse(row);
    if (parsed.success) {
      rows.push(parsed.data);
    }
  }
  return rows;
}

async function serpSearch(params: Record<string, unknown>) {
  const { serpClient } = await import("@/clients/serpCleint");
  return serpClient.search(params);
}

/** SerpApi returns 200 with an `error` field for some failures. */
function serpHasError(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { error?: unknown }).error === "string" &&
      !/hasn't returned any results/i.test((value as { error: string }).error),
  );
}

export const defaultVideoTools: VideoTools = {
  async scrapeMarkdown(url, budget) {
    const result = await callTool({
      tool: "firecrawl.scrape",
      params: { url },
      ttlMs: SCRAPE_CACHE_TTL_MS,
      budget,
      run: async () => {
        const { firecrawlClient } = await import("@/clients/FireCrawlClient");
        const { scrapeMarkdownFromFirecrawl } = await import(
          "@/services/chat/chatSerpResearch"
        );
        const scraped = await firecrawlClient.scrape({ url });
        return { markdown: scrapeMarkdownFromFirecrawl(scraped) };
      },
    });
    return result?.markdown ?? null;
  },

  async searchNews(q, budget) {
    const params = { engine: "google_news", q, gl: "in", hl: "en" };
    const json = await callTool({
      tool: "serp.google_news",
      params,
      ttlMs: NEWS_SEARCH_CACHE_TTL_MS,
      budget,
      run: () => serpSearch(params),
      isFailure: serpHasError,
    });
    const items = parseList(
      (json as { news_results?: unknown } | null)?.news_results,
      newsItemSchema,
    );
    return items.map((item) => ({
      url: item.link,
      title: item.title,
      source: item.source?.name ?? null,
      isoDate: item.iso_date ?? null,
    }));
  },

  async searchImages(engine, q, budget) {
    const params =
      engine === "bing_images"
        ? { engine, q, cc: "in" }
        : { engine, q, gl: "in", hl: "en" };
    const json = await callTool({
      tool: `serp.${engine}`,
      params,
      ttlMs: IMAGE_SEARCH_CACHE_TTL_MS,
      budget,
      run: () => serpSearch(params),
      isFailure: serpHasError,
    });
    const items = parseList(
      (json as { images_results?: unknown } | null)?.images_results,
      imageItemSchema,
    );
    return items.map((item) => ({
      source: engine,
      url: item.original,
      previewUrl: item.thumbnail ?? null,
      pageUrl: item.link ?? null,
      title: item.title ?? null,
      site: item.source ?? item.domain ?? null,
      width: item.original_width ?? null,
      height: item.original_height ?? null,
    }));
  },

  async searchPexelsPhotos(q, orientation, budget) {
    if (!isPexelsConfigured()) {
      return [];
    }
    const photos = await callTool({
      tool: "pexels.photos",
      params: { q, orientation },
      ttlMs: IMAGE_SEARCH_CACHE_TTL_MS,
      budget,
      run: () => pexelsClient.searchPhotos({ query: q, orientation, perPage: 6 }),
    });
    return (photos ?? []).map((photo) => ({
      source: "pexels" as const,
      url: photo.src.original,
      previewUrl: photo.src.medium ?? photo.src.large ?? null,
      pageUrl: photo.url,
      title: photo.alt ?? null,
      site: photo.photographer ? `Pexels / ${photo.photographer}` : "Pexels",
      width: photo.width ?? null,
      height: photo.height ?? null,
    }));
  },

  async searchPexelsVideos(q, orientation, budget) {
    if (!isPexelsConfigured()) {
      return [];
    }
    const videos = await callTool({
      tool: "pexels.videos",
      params: { q, orientation },
      ttlMs: IMAGE_SEARCH_CACHE_TTL_MS,
      budget,
      run: () => pexelsClient.searchVideos({ query: q, orientation, perPage: 6 }),
    });
    const hits: VideoHit[] = [];
    for (const video of videos ?? []) {
      // Prefer an HD mp4 over 4K originals to keep files manageable.
      const file =
        video.video_files.find((f) => f.quality === "hd" && f.file_type === "video/mp4") ??
        video.video_files[0];
      if (!file) {
        continue;
      }
      hits.push({
        source: "pexels",
        url: file.link,
        previewUrl: video.image ?? null,
        pageUrl: video.url,
        title: null,
        durationSec: video.duration ?? null,
      });
    }
    return hits;
  },

  pexelsEnabled: isPexelsConfigured,
};
