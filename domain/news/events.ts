import { z } from "zod";

/** Canonical Inngest event names for the news pipeline. Payloads are ID-only. */
export const NEWS_EVENTS = {
  DISCOVERY_REQUESTED: "news/discovery.requested",
  /** Search/source discovery phase finished; document pipeline follows. */
  DISCOVERY_SOURCES_COMPLETED: "news/discovery.sources.completed",
  /** Entire pipeline finished (Top 5 selected, DiscoveryRun COMPLETED). */
  DISCOVERY_COMPLETED: "news/discovery.completed",
  DISCOVERY_FAILED: "news/discovery.failed",

  DOCUMENTS_INGEST_REQUESTED: "news/documents.ingest.requested",
  DOCUMENTS_INGESTED: "news/documents.ingested",

  DOCUMENTS_UNDERSTAND_REQUESTED: "news/documents.understand.requested",
  DOCUMENTS_UNDERSTOOD: "news/documents.understood",

  EVENTS_PROCESS_REQUESTED: "news/events.process.requested",
  EVENTS_PROCESSED: "news/events.processed",

  EVIDENCE_PROCESS_REQUESTED: "news/evidence.process.requested",
  EVIDENCE_PROCESSED: "news/evidence.processed",

  RANKING_PRIMARY_REQUESTED: "news/ranking.primary.requested",
  RANKING_PRIMARY_COMPLETED: "news/ranking.primary.completed",

  RANKING_INDEPENDENT_REQUESTED: "news/ranking.independent.requested",
  RANKING_INDEPENDENT_COMPLETED: "news/ranking.independent.completed",

  RANKING_COVERAGE_REQUESTED: "news/ranking.coverage.requested",
  RANKING_COVERAGE_COMPLETED: "news/ranking.coverage.completed",

  RANKING_FINAL_REQUESTED: "news/ranking.final.requested",
  RANKING_FINAL_COMPLETED: "news/ranking.final.completed",
} as const;

export type NewsEventName = (typeof NEWS_EVENTS)[keyof typeof NEWS_EVENTS];

const id = z.string().min(1);

export const discoveryRunIdPayloadSchema = z.object({
  discoveryRunId: id,
});

export const rankingRunIdPayloadSchema = z.object({
  rankingRunId: id,
});

export const documentIdPayloadSchema = z.object({
  documentId: id,
});

export const discoveryFailedPayloadSchema = discoveryRunIdPayloadSchema.extend({
  reason: z.string().min(1),
  stage: z.string().min(1).optional(),
});

export type DiscoveryRunIdPayload = z.infer<typeof discoveryRunIdPayloadSchema>;
export type RankingRunIdPayload = z.infer<typeof rankingRunIdPayloadSchema>;
export type DocumentIdPayload = z.infer<typeof documentIdPayloadSchema>;
export type DiscoveryFailedPayload = z.infer<typeof discoveryFailedPayloadSchema>;

export const newsEventPayloadSchemas = {
  [NEWS_EVENTS.DISCOVERY_REQUESTED]: discoveryRunIdPayloadSchema,
  [NEWS_EVENTS.DISCOVERY_SOURCES_COMPLETED]: discoveryRunIdPayloadSchema,
  [NEWS_EVENTS.DISCOVERY_COMPLETED]: discoveryRunIdPayloadSchema,
  [NEWS_EVENTS.DISCOVERY_FAILED]: discoveryFailedPayloadSchema,

  [NEWS_EVENTS.DOCUMENTS_INGEST_REQUESTED]: discoveryRunIdPayloadSchema,
  [NEWS_EVENTS.DOCUMENTS_INGESTED]: discoveryRunIdPayloadSchema,

  [NEWS_EVENTS.DOCUMENTS_UNDERSTAND_REQUESTED]: discoveryRunIdPayloadSchema,
  [NEWS_EVENTS.DOCUMENTS_UNDERSTOOD]: discoveryRunIdPayloadSchema,

  [NEWS_EVENTS.EVENTS_PROCESS_REQUESTED]: discoveryRunIdPayloadSchema,
  [NEWS_EVENTS.EVENTS_PROCESSED]: discoveryRunIdPayloadSchema,

  [NEWS_EVENTS.EVIDENCE_PROCESS_REQUESTED]: discoveryRunIdPayloadSchema,
  [NEWS_EVENTS.EVIDENCE_PROCESSED]: discoveryRunIdPayloadSchema,

  [NEWS_EVENTS.RANKING_PRIMARY_REQUESTED]: discoveryRunIdPayloadSchema,
  [NEWS_EVENTS.RANKING_PRIMARY_COMPLETED]: rankingRunIdPayloadSchema,

  [NEWS_EVENTS.RANKING_INDEPENDENT_REQUESTED]: rankingRunIdPayloadSchema,
  [NEWS_EVENTS.RANKING_INDEPENDENT_COMPLETED]: rankingRunIdPayloadSchema,

  [NEWS_EVENTS.RANKING_COVERAGE_REQUESTED]: rankingRunIdPayloadSchema,
  [NEWS_EVENTS.RANKING_COVERAGE_COMPLETED]: discoveryRunIdPayloadSchema,

  [NEWS_EVENTS.RANKING_FINAL_REQUESTED]: discoveryRunIdPayloadSchema,
  [NEWS_EVENTS.RANKING_FINAL_COMPLETED]: discoveryRunIdPayloadSchema,
} as const satisfies Record<NewsEventName, z.ZodType>;

export type NewsEventPayloadMap = {
  [K in NewsEventName]: z.infer<(typeof newsEventPayloadSchemas)[K]>;
};

export function parseNewsEventPayload<N extends NewsEventName>(
  name: N,
  data: unknown,
): NewsEventPayloadMap[N] {
  return newsEventPayloadSchemas[name].parse(data) as NewsEventPayloadMap[N];
}
