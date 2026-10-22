import { OVERLAY_TYPES } from "@/Agents/video/creativeDirector/schema";
import { factSheetSchema } from "@/Agents/video/researchBuilder/schema";
import { z } from "zod";

export const genPrompterInputSchema = z.object({
  beats: z.array(
    z.object({
      index: z.number().int().min(0),
      overlayType: z.enum(OVERLAY_TYPES),
      needsVisual: z.boolean(),
      preferGenerative: z.boolean(),
      /** imageFinder found at least one relevant candidate. */
      goodResult: z.boolean(),
      spokenText: z.string(),
      editorNote: z.string(),
    }),
  ),
  factSheet: factSheetSchema,
  aspectRatio: z.enum(["9:16", "16:9"]),
});

export type GenPrompterInput = z.input<typeof genPrompterInputSchema>;

export const genPromptSchema = z.object({
  kind: z.enum(["image", "video"]),
  prompt: z.string().min(1),
  negativePrompt: z.string().optional(),
  style: z.string(),
  aspectRatio: z.enum(["9:16", "16:9"]),
  durationSec: z.number().optional(),
  cameraMove: z.string().optional(),
  notes: z.string(),
});

export const genPrompterOutputSchema = z.object({
  beats: z.array(
    z.object({
      index: z.number().int(),
      prompts: z.array(genPromptSchema),
      /** Prompts dropped by the safety guard (real names, logos, documents…). */
      blocked: z.number().int(),
    }),
  ),
});

export type GenPrompt = z.infer<typeof genPromptSchema>;
export type GenPrompterOutput = z.infer<typeof genPrompterOutputSchema>;

/** LLM output (strict-mode friendly). */
export const promptDraftSchema = z.object({
  beats: z.array(
    z.object({
      index: z.number().int(),
      imagePrompts: z
        .array(
          z.object({
            prompt: z.string(),
            negativePrompt: z.string().nullable(),
            style: z.string(),
            notes: z.string(),
          }),
        )
        .min(1)
        .max(3),
      videoPrompts: z
        .array(
          z.object({
            prompt: z.string(),
            negativePrompt: z.string().nullable(),
            style: z.string(),
            durationSec: z.number().nullable(),
            cameraMove: z.string().nullable(),
            notes: z.string(),
          }),
        )
        .max(2),
    }),
  ),
});

export type PromptDraft = z.infer<typeof promptDraftSchema>;
