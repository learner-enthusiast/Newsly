import type {
  DiscoveryPeriod,
  DiscoveryStatus,
  Region,
  RequestRegion,
  ScrapeStatus,
  SearchStatus,
} from "@/db/generated/client";

/** Stages of the news intelligence pipeline (orchestration only). */
export const PIPELINE_STAGES = [
  "discovery",
  "document_ingest",
  "document_understand",
  "event_process",
  "evidence_process",
  "ranking_primary",
  "ranking_independent",
  "ranking_coverage",
  "ranking_final",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type PipelineRunRef = {
  discoveryRunId: string;
};

export type PipelineRankingRef = {
  rankingRunId: string;
};

export type PipelineDocumentRef = {
  documentId: string;
};

export type DateRange = {
  startDate: Date;
  endDate: Date;
};

export type DiscoveryRunSummary = {
  id: string;
  userId: string;
  region: RequestRegion;
  period: DiscoveryPeriod;
  startDate: Date;
  endDate: Date;
  status: DiscoveryStatus;
};

export type StageResult =
  | { ok: true; discoveryRunId: string }
  | { ok: false; discoveryRunId: string; reason: string };

export type RankingStageResult =
  | { ok: true; rankingRunId: string }
  | { ok: false; rankingRunId: string; reason: string };

export type RegionTarget = Region;

export type SearchExecutionSummary = {
  id: string;
  discoveryRunId: string;
  region: Region;
  status: SearchStatus;
};

export type DocumentIngestSummary = {
  documentId: string;
  normalizedUrl: string;
  scrapeStatus: ScrapeStatus;
};
