import { NEWS_EVENTS } from "@/domain/news/events";
import type { DiscoveryPhaseStats } from "@/domain/news/discovery-metadata";
import type { StageResult } from "@/domain/news/types/pipeline";
import { SearchProviderError } from "@/providers/search/retry";
import { withSearchRetries } from "@/providers/search/retry";
import type { NewsServiceDeps } from "@/services/news/deps";
import { defaultNewsServiceDeps } from "@/services/news/deps";
import {
  planDiscoverySearches,
  type PlannedDiscoverySearch,
} from "@/services/news/discovery/query-planner";

export type SerializedPlannedDiscoverySearch = Omit<
  PlannedDiscoverySearch,
  "startDate" | "endDate"
> & {
  startDate: string | Date;
  endDate: string | Date;
};

export type DiscoveryPlanResult =
  | {
      ok: true;
      discoveryRunId: string;
      tasks: PlannedDiscoverySearch[];
    }
  | { ok: false; discoveryRunId: string; reason: string };

export type ExecuteSearchTaskResult = {
  executionKey: string;
  status: "COMPLETED" | "FAILED" | "SKIPPED";
  resultCount: number;
  duplicatesSkipped: number;
  error?: string;
};

export function createDiscoveryEngineService(deps: NewsServiceDeps) {
  return {
    async buildPlan(discoveryRunId: string): Promise<DiscoveryPlanResult> {
      const run = await deps.repos.discoveryRun.getDiscoveryRunById(
        discoveryRunId,
      );
      if (!run) {
        return { ok: false, discoveryRunId, reason: "discovery_run_not_found" };
      }

      const tasks = planDiscoverySearches({
        discoveryRunId: run.id,
        requestRegion: run.region,
        period: run.period,
        startDate: run.startDate,
        endDate: run.endDate,
      });

      return { ok: true, discoveryRunId, tasks };
    },

    async markRunning(discoveryRunId: string): Promise<StageResult> {
      const run = await deps.repos.discoveryRun.getDiscoveryRunById(
        discoveryRunId,
      );
      if (!run) {
        return { ok: false, discoveryRunId, reason: "discovery_run_not_found" };
      }

      if (run.status === "PENDING") {
        await deps.repos.discoveryRun.updateDiscoveryRunStatus(
          discoveryRunId,
          "RUNNING",
          { startedAt: new Date() },
        );
      }

      await deps.repos.discoveryRun.mergeDiscoveryRunMetadata(discoveryRunId, {
        pipelineStage: "discovery",
        pipelineStageUpdatedAt: new Date().toISOString(),
      });

      return { ok: true, discoveryRunId };
    },

    async executePlannedSearch(
      task: PlannedDiscoverySearch | SerializedPlannedDiscoverySearch,
    ): Promise<ExecuteSearchTaskResult> {
      const normalized: PlannedDiscoverySearch = {
        ...task,
        startDate:
          task.startDate instanceof Date
            ? task.startDate
            : new Date(task.startDate),
        endDate:
          task.endDate instanceof Date ? task.endDate : new Date(task.endDate),
      };
      const factory = deps.providers.search;
      if (!factory) {
        return {
          executionKey: task.executionKey,
          status: "FAILED",
          resultCount: 0,
          duplicatesSkipped: 0,
          error: "search_provider_factory_not_configured",
        };
      }

      const existing =
        await deps.repos.searchExecution.findSearchExecutionByExecutionKey(
          normalized.discoveryRunId,
          normalized.executionKey,
        );

      if (existing?.status === "COMPLETED") {
        return {
          executionKey: normalized.executionKey,
          status: "SKIPPED",
          resultCount: 0,
          duplicatesSkipped: 0,
        };
      }

      const execution =
        existing ??
        (await deps.repos.searchExecution.createSearchExecution({
          discoveryRunId: normalized.discoveryRunId,
          provider: normalized.provider,
          searchType: normalized.searchType,
          region: normalized.region,
          query: normalized.query,
          metadata: {
            executionKey: normalized.executionKey,
            dimension: normalized.dimension,
            period: normalized.period,
            variantIndex: normalized.variantIndex,
            startDate: normalized.startDate.toISOString(),
            endDate: normalized.endDate.toISOString(),
          },
        }));

      await deps.repos.searchExecution.updateSearchExecutionStatus(
        execution.id,
        "RUNNING",
        { startedAt: new Date() },
      );

      try {
        const provider = factory(normalized.provider);
        const hits = await withSearchRetries(() =>
          provider.search({
            discoveryRunId: normalized.discoveryRunId,
            provider: normalized.provider,
            searchType: normalized.searchType,
            region: normalized.region,
            query: normalized.query,
            metadata: {
              executionKey: normalized.executionKey,
              dimension: normalized.dimension,
              period: normalized.period,
              startDate: normalized.startDate.toISOString(),
              endDate: normalized.endDate.toISOString(),
            },
          }),
        );

        let duplicatesSkipped = 0;
        let resultCount = 0;

        for (const hit of hits) {
          const exists = await deps.repos.rawSearchResult.rawSearchResultExists(
            execution.id,
            hit.url,
          );
          if (exists) {
            duplicatesSkipped += 1;
            continue;
          }

          await deps.repos.rawSearchResult.createRawSearchResult({
            searchExecutionId: execution.id,
            url: hit.url,
            title: hit.title,
            snippet: hit.snippet,
            position: hit.position,
            publishedAt: hit.publishedAt,
            providerPayload: hit.raw,
            metadata: {
              dimension: normalized.dimension,
              provider: normalized.provider,
              searchType: normalized.searchType,
            },
          });
          resultCount += 1;
        }

        await deps.repos.searchExecution.updateSearchExecutionStatus(
          execution.id,
          "COMPLETED",
          { completedAt: new Date() },
          {
            resultCount,
            duplicatesSkipped,
          },
        );

        return {
          executionKey: normalized.executionKey,
          status: "COMPLETED",
          resultCount,
          duplicatesSkipped,
        };
      } catch (error) {
        const message =
          error instanceof SearchProviderError
            ? error.message
            : error instanceof Error
              ? error.message
              : "search_failed";

        await deps.repos.searchExecution.updateSearchExecutionStatus(
          execution.id,
          "FAILED",
          { completedAt: new Date() },
          {
            error: message,
            transient:
              error instanceof SearchProviderError ? error.transient : false,
          },
        );

        return {
          executionKey: normalized.executionKey,
          status: "FAILED",
          resultCount: 0,
          duplicatesSkipped: 0,
          error: message,
        };
      }
    },

    async finalizeDiscovery(
      discoveryRunId: string,
      taskResults: ExecuteSearchTaskResult[],
      plannedTasks: number,
    ): Promise<StageResult> {
      const run = await deps.repos.discoveryRun.getDiscoveryRunById(
        discoveryRunId,
      );
      if (!run) {
        return { ok: false, discoveryRunId, reason: "discovery_run_not_found" };
      }

      const executions =
        await deps.repos.searchExecution.listSearchExecutionsByDiscoveryRun(
          discoveryRunId,
        );

      const byProvider: Record<string, number> = {};
      const byRegion: Record<string, number> = {};
      for (const execution of executions) {
        byProvider[execution.provider] = (byProvider[execution.provider] ?? 0) + 1;
        byRegion[execution.region] = (byRegion[execution.region] ?? 0) + 1;
      }

      const rawResultsPersisted =
        await deps.repos.rawSearchResult.countRawSearchResultsForDiscoveryRun(
          discoveryRunId,
        );

      const stats: DiscoveryPhaseStats = {
        completedAt: new Date().toISOString(),
        plannedTasks,
        executionsCompleted: taskResults.filter((r) => r.status === "COMPLETED")
          .length,
        executionsFailed: taskResults.filter((r) => r.status === "FAILED").length,
        executionsSkipped: taskResults.filter((r) => r.status === "SKIPPED")
          .length,
        rawResultsPersisted,
        rawResultsSkippedDuplicate: taskResults.reduce(
          (sum, row) => sum + row.duplicatesSkipped,
          0,
        ),
        byProvider,
        byRegion,
      };

      await deps.repos.discoveryRun.mergeDiscoveryRunMetadata(discoveryRunId, {
        pipelineStage: "document_ingest",
        pipelineStageUpdatedAt: new Date().toISOString(),
        discovery: stats,
      });

      await deps.events.send(NEWS_EVENTS.DISCOVERY_SOURCES_COMPLETED, {
        discoveryRunId,
      });

      return { ok: true, discoveryRunId };
    },
  };
}

export const discoveryEngineService = createDiscoveryEngineService(
  defaultNewsServiceDeps,
);
