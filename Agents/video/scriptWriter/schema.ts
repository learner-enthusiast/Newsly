import { factSheetSchema } from "@/Agents/video/researchBuilder/schema";
import { z } from "zod";

export const FINANCE_DISCLAIMER = "For information only, not investment advice.";

export const scriptOptionsSchema = z.object({
  language: z.enum(["hi", "en"]),
  minSec: z.number().int().min(1),
  maxSec: z.number().int().min(1),
  pace: z.enum(["slow", "normal", "fast"]),
  aspectRatio: z.enum(["9:16", "16:9"]),
});

export const scriptWriterInputSchema = z.object({
  factSheet: factSheetSchema,
  story: z.object({ title: z.string(), category: z.string() }),
  options: scriptOptionsSchema,
});

export type ScriptWriterInput = z.input<typeof scriptWriterInputSchema>;
export type ScriptOptions = z.infer<typeof scriptOptionsSchema>;

export const beatSchema = z.object({
  index: z.number().int().min(0),
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  spokenText: z.string().min(1),
  /** ≤ 6 words. */
  onScreenText: z.string().optional(),
  kind: z.enum(["fact", "explain"]),
  factIds: z.array(z.string()),
  priority: z.enum(["core", "optional"]),
  cutNote: z.string().optional(),
});

export const scriptOutputSchema = z.object({
  title: z.string().min(1),
  hookOptions: z.array(z.string()).length(3),
  beats: z.array(beatSchema).min(1),
  cta: z.string(),
  wordCount: z.number().int(),
  estimatedSec: z.number().int(),
  lengthReason: z.string(),
  wordsPerSecond: z.number(),
  /** Present for finance stories. */
  disclaimer: z.string().optional(),
});

export type Beat = z.infer<typeof beatSchema>;
export type ScriptOutput = z.infer<typeof scriptOutputSchema>;

/** LLM output (strict-mode friendly). */
export const scriptDraftSchema = z.object({
  title: z.string(),
  hookOptions: z.array(z.string()).min(3).max(3),
  beats: z
    .array(
      z.object({
        spokenText: z.string(),
        onScreenText: z.string().nullable(),
        kind: z.enum(["fact", "explain"]),
        factIds: z.array(z.string()),
        priority: z.enum(["core", "optional"]),
        cutNote: z.string().nullable(),
      }),
    )
    .min(8)
    .max(18),
  cta: z.string(),
});

export type ScriptDraft = z.infer<typeof scriptDraftSchema>;
