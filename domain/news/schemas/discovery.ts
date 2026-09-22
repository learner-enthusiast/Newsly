import { z } from "zod";
import {
  discoveryPeriodSchema,
  requestRegionSchema,
} from "@/domain/news/schemas/shared";

export const discoveryRequestSchema = z.object({
  region: requestRegionSchema,
  period: discoveryPeriodSchema,
  /** ISO date (YYYY-MM-DD) anchor for the window; defaults to today in the service. */
  anchorDate: z.coerce.date().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type DiscoveryRequest = z.infer<typeof discoveryRequestSchema>;

export const searchExecutionInputSchema = z.object({
  discoveryRunId: z.string().min(1),
  provider: z.enum(["SERPAPI", "NSE", "BSE"]),
  searchType: z.enum([
    "GOOGLE_NEWS",
    "GOOGLE_FINANCE",
    "GOOGLE_SEARCH",
    "CORPORATE_FILINGS",
  ]),
  region: z.enum(["INDIA", "WORLD"]),
  query: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type SearchExecutionInput = z.infer<typeof searchExecutionInputSchema>;

export const rawSearchResultInputSchema = z.object({
  searchExecutionId: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1).optional(),
  snippet: z.string().optional(),
  position: z.number().int().nonnegative().optional(),
  publishedAt: z.coerce.date().optional(),
  providerPayload: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type RawSearchResultInput = z.infer<typeof rawSearchResultInputSchema>;
