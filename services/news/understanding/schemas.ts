import { z } from "zod";

export const entityTypeSchema = z.enum([
  "COMPANY",
  "PERSON",
  "ORGANIZATION",
  "GOVERNMENT",
  "REGULATOR",
  "COUNTRY",
  "CITY",
  "SECTOR",
  "INDUSTRY",
  "FINANCIAL_INSTRUMENT",
  "PRODUCT",
  "INDEX",
  "OTHER",
]);

export const claimKindSchema = z.enum([
  "factual",
  "attributed",
  "forecast",
  "opinion",
  "analysis",
]);

export const extractedEntitySchema = z.object({
  name: z.string().min(1).max(256),
  entityType: entityTypeSchema,
  aliases: z.array(z.string().min(1).max(256)).max(12).default([]),
  context: z.string().max(500).optional(),
});

export const extractedClaimSchema = z.object({
  claimText: z.string().min(8).max(2000),
  claimType: claimKindSchema,
  confidence: z.number().min(0).max(1).optional(),
  relatedEntityNames: z.array(z.string().min(1).max(256)).max(12).default([]),
});

export const documentUnderstandingOutputSchema = z.object({
  entities: z.array(extractedEntitySchema).max(40),
  claims: z.array(extractedClaimSchema).max(35),
});

export type DocumentUnderstandingOutput = z.infer<
  typeof documentUnderstandingOutputSchema
>;
export type ExtractedEntity = z.infer<typeof extractedEntitySchema>;
export type ExtractedClaim = z.infer<typeof extractedClaimSchema>;
