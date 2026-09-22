import { z } from "zod";

export const claimCreateInputSchema = z.object({
  documentId: z.string().min(1),
  claimType: z.string().min(1),
  claimText: z.string().min(1),
  normalizedClaim: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ClaimCreateInput = z.infer<typeof claimCreateInputSchema>;

export const claimPublicSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  claimType: z.string().min(1),
  claimText: z.string().min(1),
  normalizedClaim: z.string().min(1),
  confidence: z.number().nullable().optional(),
});

export type ClaimPublic = z.infer<typeof claimPublicSchema>;
