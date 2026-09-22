import type { DiscoveryRunMetadata } from "@/domain/news/pipeline-metadata";

export type DiscoveryPhaseStats = {
  completedAt: string;
  plannedTasks: number;
  executionsCompleted: number;
  executionsFailed: number;
  executionsSkipped: number;
  rawResultsPersisted: number;
  rawResultsSkippedDuplicate: number;
  byProvider: Record<string, number>;
  byRegion: Record<string, number>;
};

export type DiscoveryRunMetadataExtended = DiscoveryRunMetadata & {
  discovery?: DiscoveryPhaseStats;
};
