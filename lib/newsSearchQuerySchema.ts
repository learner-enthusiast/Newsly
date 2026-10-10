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
  /** Focused topic queries run alongside the tier plans (news pipeline). */
  topicQueries: z
    .array(
      z.object({
        tier: z.enum(["local", "world"]),
        query: z.string().min(1),
      }),
    )
    .optional(),
  /** Per-run candidate funnel (`NewsFunnel` from services/news/newsBriefingStages). */
  funnel: z
    .object({
      stages: z.array(
        z.object({
          stage: z.string(),
          total: z.number(),
          local: z.number().optional(),
          world: z.number().optional(),
          note: z.string().optional(),
        }),
      ),
      sources: z.array(
        z.object({
          id: z.string(),
          region: z.string(),
          ok: z.boolean(),
          fetched: z.number(),
          inWindow: z.number(),
          durationMs: z.number(),
          error: z.string().optional(),
        }),
      ),
      timingsMs: z.record(z.string(), z.number()),
      shortfall: z.string().optional(),
    })
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
