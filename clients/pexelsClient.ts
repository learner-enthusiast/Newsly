/**
 * Pexels photo + video search (https://www.pexels.com/api/documentation/).
 * Optional: callers check `isPexelsConfigured()` and skip when no key is set.
 */

import { z } from "zod";
import { tool } from "@/lib/observability";

const PEXELS_API_BASE = "https://api.pexels.com/v1";

const pexelsPhotoSchema = z.looseObject({
  id: z.number(),
  url: z.string(),
  alt: z.string().nullish(),
  photographer: z.string().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
  src: z.looseObject({
    original: z.string(),
    large: z.string().nullish(),
    medium: z.string().nullish(),
  }),
});

const pexelsVideoFileSchema = z.looseObject({
  quality: z.string().nullish(),
  file_type: z.string().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
  link: z.string(),
});

const pexelsVideoSchema = z.looseObject({
  id: z.number(),
  url: z.string(),
  image: z.string().nullish(),
  duration: z.number().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
  video_files: z.array(pexelsVideoFileSchema).default([]),
});

const photoSearchResponseSchema = z.looseObject({
  photos: z.array(pexelsPhotoSchema).default([]),
});

const videoSearchResponseSchema = z.looseObject({
  videos: z.array(pexelsVideoSchema).default([]),
});

export type PexelsPhoto = z.infer<typeof pexelsPhotoSchema>;
export type PexelsVideo = z.infer<typeof pexelsVideoSchema>;

export type PexelsSearchParams = {
  query: string;
  orientation?: "landscape" | "portrait" | "square";
  perPage?: number;
};

export function isPexelsConfigured(): boolean {
  return Boolean(process.env.PEXELS_API_KEY?.trim());
}

async function pexelsGet(path: string, params: PexelsSearchParams) {
  const apiKey = process.env.PEXELS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("PEXELS_API_KEY is not set");
  }
  const url = new URL(`${PEXELS_API_BASE}${path}`);
  url.searchParams.set("query", params.query);
  url.searchParams.set("per_page", String(params.perPage ?? 6));
  if (params.orientation) {
    url.searchParams.set("orientation", params.orientation);
  }
  const response = await fetch(url, {
    headers: { Authorization: apiKey },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Pexels ${path} failed with HTTP ${response.status}`);
  }
  return response.json() as Promise<unknown>;
}

async function searchPhotos(params: PexelsSearchParams): Promise<PexelsPhoto[]> {
  const json = await pexelsGet("/search", params);
  return photoSearchResponseSchema.parse(json).photos;
}

async function searchVideos(params: PexelsSearchParams): Promise<PexelsVideo[]> {
  const json = await pexelsGet("/videos/search", params);
  return videoSearchResponseSchema.parse(json).videos;
}

export const pexelsClient = {
  searchPhotos: tool("pexels.searchPhotos", searchPhotos),
  searchVideos: tool("pexels.searchVideos", searchVideos),
};
