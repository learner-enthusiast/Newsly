import { NEWS_EVENTS } from "@/domain/news/events";
import type {
  RankingStageResult,
  StageResult,
} from "@/domain/news/types/pipeline";
import type { NewsServiceDeps } from "@/services/news/deps";
import { defaultNewsServiceDeps } from "@/services/news/deps";

/** Final Top-N selection — runs after coverage challenge completes. */
export function createRankingService(deps: NewsServiceDeps) {
  return {
    async runFinalRankingStage(
      discoveryRunId: string,
    ): Promise<StageResult> {
      const run = await deps.repos.discoveryRun.getDiscoveryRunById(
        discoveryRunId,
      );
      if (!run) {
        return { ok: false, discoveryRunId, reason: "discovery_run_not_found" };
      }

      await deps.repos.discoveryRun.mergeDiscoveryRunMetadata(discoveryRunId, {
        pipelineStage: "ranking_final",
        pipelineStageUpdatedAt: new Date().toISOString(),
        rankingFinal: {
          completedAt: new Date().toISOString(),
          note: "final_top_stories_placeholder",
        },
      });

      const rankingRun = await deps.repos.ranking.findRankingRunForDiscovery(
        discoveryRunId,
        run.region === "BOTH" ? "INDIA" : run.region,
        "challenge-v1",
      );
      if (rankingRun) {
        await deps.events.send(NEWS_EVENTS.RANKING_FINAL_COMPLETED, {
          rankingRunId: rankingRun.id,
        });
      }

      return { ok: true, discoveryRunId };
    },
  };
}

export const rankingService = createRankingService(defaultNewsServiceDeps);

export type RankingStageResultLegacy = RankingStageResult;
