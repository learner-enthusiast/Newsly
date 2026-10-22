import { factSheetSchema } from "@/Agents/video/researchBuilder/schema";
import { scriptOutputSchema } from "@/Agents/video/scriptWriter/schema";
import { z } from "zod";

export const factCheckerInputSchema = z.object({
  factSheet: factSheetSchema,
  script: scriptOutputSchema,
  storyTitle: z.string(),
  language: z.enum(["hi", "en"]),
});

export type FactCheckerInput = z.input<typeof factCheckerInputSchema>;

export const beatCheckSchema = z.object({
  /** Index in the final script. */
  index: z.number().int().min(0),
  status: z.enum(["ok", "fixed", "removed_claim"]),
  issues: z.array(z.string()),
});

export const factCheckSchema = z.object({
  beats: z.array(beatCheckSchema),
  /** Beats removed entirely because nothing supported was left. */
  removedBeats: z.array(
    z.object({ originalIndex: z.number().int(), spokenText: z.string(), issues: z.array(z.string()) }),
  ),
  passed: z.boolean(),
});

export const factCheckerOutputSchema = z.object({
  factCheck: factCheckSchema,
  script: scriptOutputSchema,
});

export type BeatCheck = z.infer<typeof beatCheckSchema>;
export type FactCheck = z.infer<typeof factCheckSchema>;
export type FactCheckerOutput = z.infer<typeof factCheckerOutputSchema>;

/** LLM audit output. `span` is the exact offending text copied from the beat. */
export const auditSchema = z.object({
  beats: z.array(
    z.object({
      index: z.number().int(),
      issues: z.array(z.object({ span: z.string(), problem: z.string() })),
    }),
  ),
});

export type Audit = z.infer<typeof auditSchema>;

export const rewriteSchema = z.object({
  beats: z.array(
    z.object({
      index: z.number().int(),
      spokenText: z.string(),
      onScreenText: z.string().nullable(),
    }),
  ),
});

export type Rewrite = z.infer<typeof rewriteSchema>;
