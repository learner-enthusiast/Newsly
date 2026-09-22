import { z } from "zod";

export const primaryRankingOutputSchema = z.object({
  rankedEvents: z
    .array(
      z.object({
        eventIndex: z.number().int().nonnegative(),
        finalScore: z.number().min(0).max(1),
        importanceScore: z.number().min(0).max(1),
        noveltyScore: z.number().min(0).max(1),
        evidenceScore: z.number().min(0).max(1),
        narrativeScore: z.number().min(0).max(1),
        contentScore: z.number().min(0).max(1),
        reasoning: z.string().min(12).max(2000),
      }),
    )
    .min(1)
    .max(30),
});

export const independentRankingOutputSchema = z.object({
  rankedEvents: z
    .array(
      z.object({
        eventIndex: z.number().int().nonnegative(),
        finalScore: z.number().min(0).max(1),
        importanceScore: z.number().min(0).max(1),
        noveltyScore: z.number().min(0).max(1),
        evidenceScore: z.number().min(0).max(1),
        narrativeScore: z.number().min(0).max(1),
        contentScore: z.number().min(0).max(1),
        reasoning: z.string().min(12).max(2000),
      }),
    )
    .min(1)
    .max(15),
});

export const coverageGapQuerySchema = z.object({
  queries: z
    .array(
      z.object({
        query: z.string().min(8).max(256),
        rationale: z.string().min(12).max(500),
      }),
    )
    .min(2)
    .max(6),
});
