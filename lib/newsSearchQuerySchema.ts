import { z } from "zod";

/** Persisted search plan on `NewsRequest.searchQuery` (JSON). */
export const newsSearchQuerySchema = z.object({
  news: z.string().min(1),
  search: z.string().min(1),
  planPairs: z
    .array(
      z.object({
        news: z.string().min(1),
        search: z.string().min(1),
      }),
    )
    .optional(),
  locationGeo: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      radiusMeters: z.number().int().positive().optional(),
    })
    .optional(),
});

export type NewsSearchQuery = z.infer<typeof newsSearchQuerySchema>;
