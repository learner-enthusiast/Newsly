import { z } from "zod";

export const verificationAssessmentSchema = z.object({
  evidenceConfidence: z.number().min(0).max(1),
  verificationStatus: z.enum([
    "UNVERIFIED",
    "PARTIALLY_VERIFIED",
    "VERIFIED",
    "CONTESTED",
    "INCONCLUSIVE",
  ]),
  consensusLevel: z.enum([
    "HIGH",
    "MODERATE",
    "MIXED",
    "LOW",
    "CONTESTED",
  ]),
  reasoning: z.string().min(20).max(4000),
  citedClaimIndexes: z.array(z.number().int().nonnegative()).max(30),
  citedDocumentIndexes: z.array(z.number().int().nonnegative()).max(30),
  preserveDisagreement: z.boolean().default(false),
});

export const eventEvaluationAssessmentSchema = z.object({
  financialSignificance: z.number().min(0).max(1),
  marketRelevance: z.number().min(0).max(1),
  economicImpact: z.number().min(0).max(1),
  breadth: z.number().min(0).max(1),
  magnitude: z.number().min(0).max(1),
  investorRelevance: z.number().min(0).max(1),
  novelty: z.number().min(0).max(1),
  narrativeSignificance: z.number().min(0).max(1),
  contentPotential: z.number().min(0).max(1),
  humanInterest: z.number().min(0).max(1),
  explainability: z.number().min(0).max(1),
  previousState: z.string().max(2000).optional(),
  newInformation: z.boolean(),
  whatChanged: z.string().min(8).max(2000),
  whyItMatters: z.string().min(8).max(2000),
  reasoning: z.string().min(20).max(4000),
  citedClaimIndexes: z.array(z.number().int().nonnegative()).max(20),
});

export type VerificationAssessment = z.infer<typeof verificationAssessmentSchema>;
export type EventEvaluationAssessment = z.infer<
  typeof eventEvaluationAssessmentSchema
>;
