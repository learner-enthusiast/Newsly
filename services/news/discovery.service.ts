import { NEWS_EVENTS } from "@/domain/news/events";
import { resolveDiscoveryDateRange } from "@/domain/news/discovery-period";
import {
  discoveryRequestSchema,
  type DiscoveryRequest,
} from "@/domain/news/schemas/discovery";
import {
  defaultNewsServiceDeps,
  type NewsServiceDeps,
} from "@/services/news/deps";

export type StartDiscoveryInput = {
  userId: string;
  request: DiscoveryRequest;
};

export type StartDiscoveryResult = {
  discoveryRunId: string;
  status: "PENDING";
};

export function createDiscoveryService(deps: NewsServiceDeps) {
  return {
    /**
     * API entry: persist DiscoveryRun and enqueue async pipeline work.
     * Does not run search, scrape, or ranking.
     */
    async startDiscovery(
      input: StartDiscoveryInput,
    ): Promise<StartDiscoveryResult> {
      const request = discoveryRequestSchema.parse(input.request);
      const { startDate, endDate } = resolveDiscoveryDateRange({
        period: request.period,
        startDate: request.startDate,
        endDate: request.endDate,
      });

      const run = await deps.repos.discoveryRun.createDiscoveryRun({
        userId: input.userId,
        region: request.region,
        period: request.period,
        startDate,
        endDate,
        metadata: request.metadata,
      });

      await deps.events.send(NEWS_EVENTS.DISCOVERY_REQUESTED, {
        discoveryRunId: run.id,
      });

      return { discoveryRunId: run.id, status: "PENDING" };
    },

    async getDiscoveryRunForUser(discoveryRunId: string, userId: string) {
      return deps.repos.discoveryRun.getDiscoveryRunForUser(
        discoveryRunId,
        userId,
      );
    },

    /** Full pipeline finished — does not re-emit discovery phase events. */
    async markDiscoveryRunCompleted(discoveryRunId: string) {
      await deps.repos.discoveryRun.updateDiscoveryRunStatus(
        discoveryRunId,
        "COMPLETED",
        { completedAt: new Date() },
      );
      await deps.repos.discoveryRun.mergeDiscoveryRunMetadata(discoveryRunId, {
        pipelineStage: "ranking_final",
        pipelineStageUpdatedAt: new Date().toISOString(),
      });
      await deps.events.send(NEWS_EVENTS.DISCOVERY_COMPLETED, {
        discoveryRunId,
      });
    },

    async markDiscoveryFailed(
      discoveryRunId: string,
      reason: string,
      stage?: string,
    ) {
      await deps.repos.discoveryRun.updateDiscoveryRunStatus(
        discoveryRunId,
        "FAILED",
        { completedAt: new Date() },
      );
      await deps.repos.discoveryRun.mergeDiscoveryRunMetadata(discoveryRunId, {
        failureReason: reason,
        failureStage: stage,
        pipelineStageUpdatedAt: new Date().toISOString(),
      });
      await deps.events.send(NEWS_EVENTS.DISCOVERY_FAILED, {
        discoveryRunId,
        reason,
        stage,
      });
    },
  };
}

export type DiscoveryService = ReturnType<typeof createDiscoveryService>;

export const discoveryService = createDiscoveryService(defaultNewsServiceDeps);
