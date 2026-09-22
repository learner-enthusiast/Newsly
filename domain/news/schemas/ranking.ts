import { z } from "zod";
import {
  discoveryPeriodSchema,
  regionSchema,
} from "@/domain/news/schemas/shared";

export const rankingRequestSchema = z.object({
  discoveryRunId: z.string().min(1),
  region: regionSchema,
  period: discoveryPeriodSchema,
  rankingVersion: z.string().min(1).default("v1"),
  methodology: z.string().optional(),
});

export type RankingRequest = z.infer<typeof rankingRequestSchema>;

export const eventRankingUpsertSchema = z.object({
  rankingRunId: z.string().min(1),
  eventId: z.string().min(1),
  rank: z.number().int().positive(),
  finalScore: z.number().optional(),
  importanceScore: z.number().optional(),
  noveltyScore: z.number().optional(),
  evidenceScore: z.number().optional(),
  narrativeScore: z.number().optional(),
  contentScore: z.number().optional(),
  reasoning: z.string().optional(),
});

export type EventRankingUpsertInput = z.infer<typeof eventRankingUpsertSchema>;
