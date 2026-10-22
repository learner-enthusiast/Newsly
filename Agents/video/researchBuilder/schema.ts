import { z } from "zod";

export const researchSourceInputSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  title: z.string(),
  domain: z.string().nullable(),
  scrapedContent: z.string().nullable(),
  transcript: z.string().nullable(),
  publishedAt: z.string().nullable(),
});

export const researchBuilderInputSchema = z.object({
  story: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().nullable(),
    summary: z.string(),
    content: z.string(),
    category: z.string(),
    location: z.string().nullable(),
    publishedAt: z.string().nullable(),
    createdAt: z.string(),
  }),
  sources: z.array(researchSourceInputSchema),
  /** ISO timestamp; injected so age checks are deterministic. */
  now: z.string(),
});

export type ResearchBuilderInput = z.input<typeof researchBuilderInputSchema>;

export const FACT_TYPES = ["number", "date", "name", "event", "quote", "context"] as const;

export const factSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  type: z.enum(FACT_TYPES),
  value: z.string().optional(),
  /** Quotes only. */
  speaker: z.string().optional(),
  sourceIds: z.array(z.string()).min(1),
  sourceUrls: z.array(z.string()),
  confidence: z.enum(["high", "medium"]),
});

export const factSheetSourceSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  /** stored = existing NewsSource / story; search = found by this run. */
  origin: z.enum(["story", "stored", "search"]),
});

export const factSheetSchema = z.object({
  facts: z.array(factSchema).min(1),
  whatHappened: z.string().min(1),
  whatChanged: z.string(),
  whyItMatters: z.array(z.string()),
  whoIsAffected: z.array(z.string()),
  openQuestions: z.array(z.string()),
  conflicts: z.array(
    z.object({ factA: z.string(), factB: z.string(), note: z.string() }),
  ),
  /** Finance / markets story → scripts and descriptions carry the disclaimer. */
  isFinance: z.boolean(),
  sources: z.array(factSheetSourceSchema),
  searchQueries: z.array(z.string()),
  /** Extracted facts dropped because no source supported their numbers/quote. */
  droppedUngroundedFacts: z.number().int().default(0),
});

export type Fact = z.infer<typeof factSchema>;
export type FactSheet = z.infer<typeof factSheetSchema>;

/** LLM output: strict-mode friendly (nullable, no string length limits). */
export const factExtractionSchema = z.object({
  facts: z
    .array(
      z.object({
        text: z.string(),
        type: z.enum(FACT_TYPES),
        value: z.string().nullable(),
        speaker: z.string().nullable(),
        sourceIds: z.array(z.string()),
        confidence: z.enum(["high", "medium"]),
      }),
    )
    .max(60),
  whatHappened: z.string(),
  whatChanged: z.string(),
  whyItMatters: z.array(z.string()).max(6),
  whoIsAffected: z.array(z.string()).max(6),
  openQuestions: z.array(z.string()).max(6),
  conflicts: z
    .array(
      z.object({
        factA: z.number().int(),
        factB: z.number().int(),
        note: z.string(),
      }),
    )
    .max(10),
  isFinance: z.boolean(),
});

export type FactExtraction = z.infer<typeof factExtractionSchema>;
