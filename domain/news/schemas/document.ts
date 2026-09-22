import { z } from "zod";

export const documentCreateInputSchema = z.object({
  sourceId: z.string().min(1),
  url: z.string().url(),
  canonicalUrl: z.string().url().optional(),
  normalizedUrl: z.string().min(1),
  title: z.string().min(1),
  author: z.string().min(1).optional(),
  publishedAt: z.coerce.date().optional(),
  content: z.string(),
  contentHash: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type DocumentCreateInput = z.infer<typeof documentCreateInputSchema>;

export const documentPublicSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  url: z.string().url(),
  normalizedUrl: z.string().min(1),
  title: z.string().min(1),
  scrapeStatus: z.enum([
    "PENDING",
    "RUNNING",
    "COMPLETED",
    "FAILED",
    "BLOCKED",
  ]),
  publishedAt: z.coerce.date().nullable().optional(),
});

export type DocumentPublic = z.infer<typeof documentPublicSchema>;
