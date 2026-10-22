import { OVERLAY_TYPES } from "@/Agents/video/creativeDirector/schema";
import { z } from "zod";

export const imageFinderInputSchema = z.object({
  beats: z.array(
    z.object({
      index: z.number().int().min(0),
      overlayType: z.enum(OVERLAY_TYPES),
      searchQueries: z.array(z.string()).max(3),
      spokenText: z.string(),
      onScreenText: z.string().optional(),
    }),
  ),
  aspectRatio: z.enum(["9:16", "16:9"]),
});

export type ImageFinderInput = z.input<typeof imageFinderInputSchema>;

export const MEDIA_SOURCES = ["google_images", "google_images_light", "bing_images", "pexels"] as const;

export const mediaCandidateSchema = z.object({
  kind: z.enum(["image", "video"]),
  source: z.enum(MEDIA_SOURCES),
  url: z.string(),
  previewUrl: z.string().nullable(),
  pageUrl: z.string().nullable(),
  title: z.string().nullable(),
  site: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  durationSec: z.number().nullable(),
  query: z.string(),
  /** LLM relevance; "unranked" when ranking was unavailable. */
  relevance: z.enum(["high", "medium", "low", "unranked"]),
  rank: z.number().int().min(0),
});

export type MediaCandidate = z.infer<typeof mediaCandidateSchema>;

export const beatMediaSchema = z.object({
  index: z.number().int(),
  overlayType: z.enum(OVERLAY_TYPES),
  candidates: z.array(mediaCandidateSchema).max(4),
  /** At least one high/medium (or unranked) candidate. */
  goodResult: z.boolean(),
  searched: z.array(z.string()),
  /** Why nothing was searched (e.g. Pexels key missing for b-roll). */
  skipped: z.string().optional(),
});

export const imageFinderOutputSchema = z.object({
  beats: z.array(beatMediaSchema),
  ranked: z.boolean(),
});

export type BeatMedia = z.infer<typeof beatMediaSchema>;
export type ImageFinderOutput = z.infer<typeof imageFinderOutputSchema>;

/** LLM ranking output: candidate positions per beat, best first. */
export const rankingSchema = z.object({
  beats: z.array(
    z.object({
      index: z.number().int(),
      ranked: z.array(
        z.object({
          candidate: z.number().int(),
          relevance: z.enum(["high", "medium", "low"]),
        }),
      ),
    }),
  ),
});

export type Ranking = z.infer<typeof rankingSchema>;
