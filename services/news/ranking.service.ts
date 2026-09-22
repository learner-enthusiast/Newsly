import { NEWS_EVENTS } from "@/domain/news/events";
import { regionTargetsForRequest } from "@/providers/search-provider";
import {
  rankingRequestSchema,
  type RankingRequest,
} from "@/domain/news/schemas/ranking";
import type {
  RankingStageResult,
  StageResult,
} from "@/domain/news/types/pipeline";
import type { NewsServiceDeps } from "@/services/news/deps";
import { defaultNewsServiceDeps } from "@/services/news/deps";
import { createCoverageGapService } from "@/services/news/coverage-gap.service";

export function createRankingService(deps: NewsServiceDeps) {
  const coverageGap = createCoverageGapService(deps);

  return {
    async ensureRankingRun(request: RankingRequest) {
      const parsed = rankingRequestSchema.parse(request);
      const existing = await deps.repos.ranking.findRankingRunForDiscovery(
        parsed.discoveryRunId,
        parsed.region,
        parsed.rankingVersion,
      );
      if (existing) {
        return existing;
      }
      return deps.repos.ranking.createRankingRun({
        discoveryRunId: parsed.discoveryRunId,
        region: parsed.region,
        period: parsed.period,
        rankingVersion: parsed.rankingVersion,
        methodology: parsed.methodology,
      });
    },

    async resolvePrimaryRankingRun(discoveryRunId: string) {
      const run = await deps.repos.discoveryRun.getDiscoveryRunById(
        discoveryRunId,
      );
      if (!run) {
        return null;
      }

      const regions = regionTargetsForRequest(run.region);
      const primaryRegion = regions[0];
      return this.ensureRankingRun({
        discoveryRunId,
        region: primaryRegion,
        period: run.period,
        rankingVersion: "v1",
      });
    },

    async runPrimaryRankingStage(discoveryRunId: string): Promise<StageResult> {
      const rankingRun = await this.resolvePrimaryRankingRun(discoveryRunId);
      if (!rankingRun) {
        return { ok: false, discoveryRunId, reason: "discovery_run_not_found" };
      }

      await deps.repos.ranking.updateRankingRunStatus(rankingRun.id, "RUNNING", {
        startedAt: new Date(),
      });

      await deps.events.send(NEWS_EVENTS.RANKING_PRIMARY_COMPLETED, {
        rankingRunId: rankingRun.id,
      });
      await deps.events.send(NEWS_EVENTS.RANKING_INDEPENDENT_REQUESTED, {
        rankingRunId: rankingRun.id,
      });

      return { ok: true, discoveryRunId };
    },

    async runIndependentRankingStage(
      rankingRunId: string,
    ): Promise<RankingStageResult> {
      const rankingRun = await deps.repos.ranking.getRankingRunById(rankingRunId);
      if (!rankingRun) {
        return { ok: false, rankingRunId, reason: "ranking_run_not_found" };
      }

      await deps.events.send(NEWS_EVENTS.RANKING_INDEPENDENT_COMPLETED, {
        rankingRunId,
      });
      await deps.events.send(NEWS_EVENTS.RANKING_COVERAGE_REQUESTED, {
        rankingRunId,
      });

      return { ok: true, rankingRunId };
    },

    async runCoverageRankingStage(
      rankingRunId: string,
    ): Promise<RankingStageResult> {
      const rankingRun = await deps.repos.ranking.getRankingRunById(rankingRunId);
      if (!rankingRun) {
        return { ok: false, rankingRunId, reason: "ranking_run_not_found" };
      }

      await coverageGap.runCoverageGapStage(rankingRunId);

      await deps.events.send(NEWS_EVENTS.RANKING_COVERAGE_COMPLETED, {
        rankingRunId,
      });
      await deps.events.send(NEWS_EVENTS.RANKING_FINAL_REQUESTED, {
        rankingRunId,
      });

      return { ok: true, rankingRunId };
    },

    async runFinalRankingStage(
      rankingRunId: string,
    ): Promise<RankingStageResult> {
      const rankingRun = await deps.repos.ranking.getRankingRunById(rankingRunId);
      if (!rankingRun) {
        return { ok: false, rankingRunId, reason: "ranking_run_not_found" };
      }

      await deps.repos.ranking.updateRankingRunStatus(rankingRun.id, "COMPLETED", {
        completedAt: new Date(),
      });

      await deps.events.send(NEWS_EVENTS.RANKING_FINAL_COMPLETED, {
        rankingRunId,
      });

      return { ok: true, rankingRunId };
    },
  };
}

export const rankingService = createRankingService(defaultNewsServiceDeps);
