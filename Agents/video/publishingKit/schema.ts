import { creativeDirectionSchema } from "@/Agents/video/creativeDirector/schema";
import { factSheetSchema } from "@/Agents/video/researchBuilder/schema";
import { scriptOutputSchema } from "@/Agents/video/scriptWriter/schema";
import { z } from "zod";

export const publishingKitInputSchema = z.object({
  script: scriptOutputSchema,
  factSheet: factSheetSchema,
  direction: creativeDirectionSchema,
  language: z.enum(["hi", "en"]),
  aspectRatio: z.enum(["9:16", "16:9"]),
});

export type PublishingKitInput = z.input<typeof publishingKitInputSchema>;

export const TITLE_STYLES = ["curiosity", "direct", "number", "question", "hindi_english_mix"] as const;

/** OpenAI image sizes (custom WIDTHxHEIGHT, multiples of 16) matching the video. */
export const THUMBNAIL_SIZE = { "16:9": "1536x864", "9:16": "864x1536" } as const;

export const publishingKitSchema = z.object({
  titles: z
    .array(z.object({ text: z.string().min(1), style: z.enum(TITLE_STYLES), charCount: z.number().int() }))
    .min(1)
    .max(5),
  thumbnail: z.object({
    concepts: z
      .array(z.object({ idea: z.string(), textOverlay: z.string(), layout: z.string() }))
      .min(1)
      .max(3),
    openaiPrompts: z
      .array(z.object({ prompt: z.string().min(1), size: z.string(), notes: z.string() }))
      .max(3),
    tips: z.array(z.string()),
  }),
  descriptions: z.object({
    youtube: z.string().min(1),
    shorts: z.string().min(1),
    instagram: z.string().min(1),
    /** ≤ 280 chars. */
    x: z.string().min(1).max(280),
  }),
  hashtags: z.array(z.string()).max(10),
  pinnedComment: z.string().min(1),
  /** Items dropped for claiming what the script does not say, or unsafe prompts. */
  dropped: z.array(z.string()),
});

export type PublishingKit = z.infer<typeof publishingKitSchema>;

/** LLM output (strict-mode friendly). */
export const publishingDraftSchema = z.object({
  titles: z.array(z.object({ text: z.string(), style: z.enum(TITLE_STYLES) })).min(5).max(5),
  thumbnail: z.object({
    concepts: z
      .array(z.object({ idea: z.string(), textOverlay: z.string(), layout: z.string() }))
      .min(3)
      .max(3),
    openaiPrompts: z.array(z.object({ prompt: z.string(), notes: z.string() })).min(2).max(3),
    tips: z.array(z.string()).max(5),
  }),
  descriptions: z.object({
    youtubeSummary: z.string(),
    youtubeKeyPoints: z.array(z.string()).max(6),
    shorts: z.string(),
    instagram: z.string(),
    x: z.string(),
  }),
  hashtags: z.array(z.string()).max(12),
  pinnedComment: z.string(),
});

export type PublishingDraft = z.infer<typeof publishingDraftSchema>;
