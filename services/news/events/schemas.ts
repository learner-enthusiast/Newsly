import { z } from "zod";
import { entityTypeSchema } from "@/services/news/understanding/schemas";

export const eventTypeSchema = z.enum([
  "CORPORATE",
  "FINANCIAL",
  "ECONOMIC",
  "MARKET",
  "REGULATORY",
  "POLITICAL",
  "LEGAL",
  "GEOPOLITICAL",
  "TECHNOLOGY",
  "COMMODITY",
  "MACRO",
  "OTHER",
]);

export const actionStateSchema = z.enum([
  "rumored",
  "considering",
  "announced",
  "completed",
  "denied",
  "cancelled",
  "ongoing",
  "unknown",
]);

export const eventDocumentRelationshipSchema = z.enum([
  "REPORTS",
  "SUPPORTS",
  "PRIMARY_SOURCE",
  "ANALYSIS",
  "FOLLOW_UP",
]);

export const extractedEventCandidateSchema = z.object({
  title: z.string().min(8).max(500),
  description: z.string().max(2000).optional(),
  eventType: eventTypeSchema,
  actionState: actionStateSchema,
  eventDate: z.string().optional(),
  claimIndexes: z.array(z.number().int().nonnegative()).min(1).max(20),
  entityNames: z.array(z.string().min(1).max(256)).max(20).default([]),
  keyNumbers: z.array(z.string().min(1).max(128)).max(12).default([]),
  primaryAction: z.string().max(256).optional(),
  documentRelationship: eventDocumentRelationshipSchema.default("REPORTS"),
  claimRelationship: z
    .enum(["SUPPORTS", "DESCRIBES", "QUALIFIES", "CONTRADICTS", "UPDATES"])
    .default("SUPPORTS"),
});

export const extractedContradictionSchema = z.object({
  claimIndexA: z.number().int().nonnegative(),
  claimIndexB: z.number().int().nonnegative(),
  contradictionType: z.string().min(1).max(128),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  explanation: z.string().min(8).max(2000),
  confidence: z.number().min(0).max(1).optional(),
});

export const documentEventExtractionSchema = z.object({
  events: z.array(extractedEventCandidateSchema).max(12),
  contradictions: z.array(extractedContradictionSchema).max(10).default([]),
});

export const eventMergeAdjudicationSchema = z.object({
  merge: z.boolean(),
  reasoning: z.string().max(1000),
  confidence: z.number().min(0).max(1),
});

export const narrativeDetectionSchema = z.object({
  narratives: z.array(
    z.object({
      title: z.string().min(8).max(300),
      description: z.string().max(2000).optional(),
      eventIndexes: z.array(z.number().int().nonnegative()).min(1).max(20),
      relationship: z
        .enum([
          "UPDATE",
          "FOLLOW_UP",
          "CAUSE",
          "EFFECT",
          "ESCALATION",
          "REVERSAL",
          "RELATED",
        ])
        .default("RELATED"),
    }),
  ).max(8),
});

export type DocumentEventExtraction = z.infer<typeof documentEventExtractionSchema>;
export type ExtractedEventCandidate = z.infer<typeof extractedEventCandidateSchema>;
