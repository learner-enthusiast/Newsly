import { z } from "zod";

export const eventEvaluationInputSchema = z.object({
  eventId: z.string().min(1),
  financialSignificance: z.number().min(0).max(1).optional(),
  marketRelevance: z.number().min(0).max(1).optional(),
  economicImpact: z.number().min(0).max(1).optional(),
  breadth: z.number().min(0).max(1).optional(),
  magnitude: z.number().min(0).max(1).optional(),
  investorRelevance: z.number().min(0).max(1).optional(),
  novelty: z.number().min(0).max(1).optional(),
  narrativeSignificance: z.number().min(0).max(1).optional(),
  contentPotential: z.number().min(0).max(1).optional(),
  humanInterest: z.number().min(0).max(1).optional(),
  explainability: z.number().min(0).max(1).optional(),
  evidenceConfidence: z.number().min(0).max(1).optional(),
  consensusLevel: z
    .enum(["HIGH", "MODERATE", "MIXED", "LOW", "CONTESTED"])
    .optional(),
  contradictionSeverity: z
    .enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
    .optional(),
  previousState: z.record(z.string(), z.unknown()).optional(),
  newInformation: z.boolean().optional(),
  whatChanged: z.string().optional(),
  whyItMatters: z.string().optional(),
  reasoning: z.string().optional(),
  model: z.string().optional(),
  promptVersion: z.string().optional(),
});

export type EventEvaluationInput = z.infer<typeof eventEvaluationInputSchema>;
