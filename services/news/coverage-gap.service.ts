import type { Region } from "@/db/generated/client";
import type { NewsServiceDeps } from "@/services/news/deps";
import { defaultNewsServiceDeps } from "@/services/news/deps";

export function createCoverageGapService(deps: NewsServiceDeps) {
  return {
    async ensureCoverageGapRun(input: {
      rankingRunId: string;
      discoveryRunId?: string;
      region: Region;
    }) {
      const existing = await deps.repos.coverageGap.findCoverageGapRunByRankingRun(
        input.rankingRunId,
      );
      if (existing) {
        return existing;
      }
      return deps.repos.coverageGap.createCoverageGapRun(input);
    },

    async runCoverageGapStage(rankingRunId: string) {
      const rankingRun = await deps.repos.ranking.getRankingRunById(rankingRunId);
      if (!rankingRun) {
        return { ok: false as const, rankingRunId, reason: "ranking_run_not_found" };
      }

      await this.ensureCoverageGapRun({
        rankingRunId,
        discoveryRunId: rankingRun.discoveryRunId,
        region: rankingRun.region,
      });

      return { ok: true as const, rankingRunId };
    },
  };
}

export const coverageGapService = createCoverageGapService(
  defaultNewsServiceDeps,
);
