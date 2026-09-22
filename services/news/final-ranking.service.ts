import { NEWS_EVENTS } from "@/domain/news/events";
import { titleJaccardSimilarity } from "@/domain/news/normalize-event-title";
import type { Region } from "@/db/generated/client";
import { regionTargetsForRequest } from "@/providers/search-provider";
import type { StageResult } from "@/domain/news/types/pipeline";
import type { NewsServiceDeps } from "@/services/news/deps";
import { defaultNewsServiceDeps } from "@/services/news/deps";
import {
  FINAL_RANKING_METHODOLOGY,
  FINAL_RANKING_VERSION,
  FINALIST_COUNT,
  RANKING_VERSION,
} from "@/services/news/ranking/constants";
import { decimalToNumber } from "@/services/news/ranking/event-context";

const TOP_STORIES_COUNT = 5;
const DUPLICATE_TITLE_THRESHOLD = 0.85;

type ScoredCandidate = {
  eventId: string;
  compositeScore: number;
  reasoning: string;
  narrativeIds: string[];
  title: string;
  components: Record<string, number>;
};

function evaluationImportance(
  evaluation: {
    financialSignificance?: unknown;
    marketRelevance?: unknown;
    economicImpact?: unknown;
    magnitude?: unknown;
    investorRelevance?: unknown;
    contentPotential?: unknown;
  } | null,
): number {
  if (!evaluation) {
    return 0;
  }
  const dims = [
    decimalToNumber(evaluation.financialSignificance),
    decimalToNumber(evaluation.marketRelevance),
    decimalToNumber(evaluation.economicImpact),
    decimalToNumber(evaluation.magnitude),
    decimalToNumber(evaluation.investorRelevance),
    decimalToNumber(evaluation.contentPotential),
  ].filter((value): value is number => value !== undefined);
  if (dims.length === 0) {
    return 0;
  }
  return dims.reduce((sum, value) => sum + value, 0) / dims.length;
}

function rankToScore(rank: number | undefined, poolSize: number): number {
  if (!rank || poolSize <= 0) {
    return 0.35;
  }
  return Math.max(0, 1 - (rank - 1) / poolSize);
}

export function createFinalRankingService(deps: NewsServiceDeps) {
  return {
    async runFinalRankingForDiscoveryRun(
      discoveryRunId: string,
    ): Promise<
      StageResult & {
        regions?: Array<{ region: Region; rankingRunId: string; topCount: number }>;
      }
    > {
      const run = await deps.repos.discoveryRun.getDiscoveryRunById(
        discoveryRunId,
      );
      if (!run) {
        return { ok: false, discoveryRunId, reason: "discovery_run_not_found" };
      }

      const prior = run.metadata as Record<string, unknown> | null;
      if (
        prior?.finalRanking &&
        typeof prior.finalRanking === "object" &&
        typeof (prior.finalRanking as Record<string, unknown>).completedAt ===
          "string"
      ) {
        return { ok: true, discoveryRunId };
      }

      await deps.repos.discoveryRun.mergeDiscoveryRunMetadata(discoveryRunId, {
        pipelineStage: "ranking_final",
        pipelineStageUpdatedAt: new Date().toISOString(),
      });

      const regions = regionTargetsForRequest(run.region);
      const regionResults: Array<{
        region: Region;
        rankingRunId: string;
        topCount: number;
      }> = [];

      for (const region of regions) {
        const result = await this.runFinalRankingForRegion(
          discoveryRunId,
          region,
        );
        if (!result.ok) {
          return {
            ok: false,
            discoveryRunId,
            reason: result.reason ?? "final_ranking_failed",
          };
        }
        regionResults.push({
          region,
          rankingRunId: result.rankingRunId,
          topCount: result.topCount,
        });
      }

      await deps.repos.discoveryRun.mergeDiscoveryRunMetadata(discoveryRunId, {
        finalRanking: {
          completedAt: new Date().toISOString(),
          version: FINAL_RANKING_VERSION,
          regions: regionResults,
        },
      });

      await deps.events.send(NEWS_EVENTS.RANKING_FINAL_COMPLETED, {
        discoveryRunId,
      });

      return { ok: true, discoveryRunId, regions: regionResults };
    },

    async runFinalRankingForRegion(
      discoveryRunId: string,
      region: Region,
    ): Promise<
      | { ok: true; rankingRunId: string; topCount: number }
      | { ok: false; reason: string }
    > {
      const run = await deps.repos.discoveryRun.getDiscoveryRunById(
        discoveryRunId,
      );
      if (!run) {
        return { ok: false, reason: "discovery_run_not_found" };
      }

      const challengeRun = await deps.repos.ranking.findRankingRunForDiscovery(
        discoveryRunId,
        region,
        RANKING_VERSION,
      );
      if (!challengeRun) {
        return { ok: false, reason: "challenge_ranking_run_not_found" };
      }

      let finalRun = await deps.repos.ranking.findRankingRunForDiscovery(
        discoveryRunId,
        region,
        FINAL_RANKING_VERSION,
      );

      finalRun =
        finalRun ??
        (await deps.repos.ranking.createRankingRun({
          discoveryRunId,
          region,
          period: run.period,
          rankingVersion: FINAL_RANKING_VERSION,
          methodology: FINAL_RANKING_METHODOLOGY,
          metadata: {
            sourceChallengeRankingRunId: challengeRun.id,
          },
        }));

      if (
        finalRun.metadata &&
        typeof finalRun.metadata === "object" &&
        (finalRun.metadata as Record<string, unknown>).finalizedAt
      ) {
        const selections =
          await deps.repos.ranking.listTopStorySelectionsForRankingRun(
            finalRun.id,
          );
        return {
          ok: true,
          rankingRunId: finalRun.id,
          topCount: selections.length,
        };
      }

      await deps.repos.ranking.updateRankingRunStatus(finalRun.id, "RUNNING", {
        startedAt: new Date(),
      });

      const primaryRankings =
        await deps.repos.ranking.listEventRankingsForRun(challengeRun.id);
      const poolSize = primaryRankings.length || 1;

      const metadata = challengeRun.metadata as Record<string, unknown> | null;
      const independentRanks =
        metadata?.independentRanks &&
        typeof metadata.independentRanks === "object"
          ? (metadata.independentRanks as Record<string, number>)
          : {};

      const candidateEventIds = new Set<string>(
        primaryRankings.map((row) => row.eventId),
      );
      const gapEventIds =
        await deps.repos.coverageGap.listEvaluatedGapEventIdsForDiscoveryRun(
          discoveryRunId,
          region,
        );
      for (const eventId of gapEventIds) {
        candidateEventIds.add(eventId);
      }

      const scored: ScoredCandidate[] = [];

      for (const eventId of candidateEventIds) {
        const eligible = await this.validateFinalCandidate(eventId);
        if (!eligible.ok) {
          continue;
        }

        const primary = primaryRankings.find((row) => row.eventId === eventId);
        const disagreement =
          await deps.repos.ranking.findRankingDisagreementForEvent(
            challengeRun.id,
            eventId,
          );
        const disagreementMeta =
          disagreement?.metadata &&
          typeof disagreement.metadata === "object"
            ? (disagreement.metadata as Record<string, unknown>)
            : {};
        const requiresReview = disagreementMeta.requiresReview === true;

        const primaryRankScore = rankToScore(primary?.rank, poolSize);
        const independentRankScore = rankToScore(
          independentRanks[eventId],
          Object.keys(independentRanks).length || FINALIST_COUNT,
        );
        const evalImportance = evaluationImportance(eligible.evaluation);
        const evidenceConfidence =
          decimalToNumber(eligible.verification?.evidenceConfidence) ?? 0;
        const narrativeSignificance =
          decimalToNumber(eligible.evaluation?.narrativeSignificance) ?? 0;
        const disagreementPenalty = requiresReview ? 0.1 : 0;

        const compositeScore =
          0.32 * primaryRankScore +
          0.28 * independentRankScore +
          0.22 * evalImportance +
          0.12 * evidenceConfidence +
          0.06 * narrativeSignificance -
          disagreementPenalty;

        const reasoning = [
          `Composite ${compositeScore.toFixed(4)} using ${FINAL_RANKING_VERSION}.`,
          primary
            ? `Primary rank ${primary.rank}/${poolSize}.`
            : "Not in primary pool (coverage-gap path).",
          independentRanks[eventId]
            ? `Independent rank ${independentRanks[eventId]}.`
            : "No independent rank.",
          requiresReview ? "Ranking disagreement flagged for review." : "",
          eligible.evaluation?.whyItMatters
            ? `Why it matters: ${eligible.evaluation.whyItMatters.slice(0, 240)}`
            : "",
        ]
          .filter(Boolean)
          .join(" ");

        scored.push({
          eventId,
          compositeScore,
          reasoning,
          narrativeIds: eligible.narrativeIds,
          title: eligible.event.title,
          components: {
            primaryRankScore,
            independentRankScore,
            evalImportance,
            evidenceConfidence,
            narrativeSignificance,
            disagreementPenalty,
          },
        });
      }

      scored.sort((a, b) => b.compositeScore - a.compositeScore);

      const selected: ScoredCandidate[] = [];
      for (const candidate of scored) {
        if (selected.length >= TOP_STORIES_COUNT) {
          break;
        }

        const isDuplicate = selected.some((existing) => {
          const titleSimilar = titleJaccardSimilarity(
            existing.title,
            candidate.title,
          );
          if (titleSimilar < DUPLICATE_TITLE_THRESHOLD) {
            return false;
          }
          const sharedNarrative = existing.narrativeIds.some((id) =>
            candidate.narrativeIds.includes(id),
          );
          return sharedNarrative || titleSimilar >= DUPLICATE_TITLE_THRESHOLD;
        });

        if (isDuplicate) {
          continue;
        }

        selected.push(candidate);
      }

      let rank = 1;
      for (const row of selected) {
        await deps.repos.ranking.upsertEventRanking({
          rankingRunId: finalRun.id,
          eventId: row.eventId,
          rank,
          finalScore: row.compositeScore,
          importanceScore: row.components.evalImportance,
          evidenceScore: row.components.evidenceConfidence,
          narrativeScore: row.components.narrativeSignificance,
          reasoning: row.reasoning,
        });

        await deps.repos.ranking.createTopStorySelection({
          rankingRunId: finalRun.id,
          eventId: row.eventId,
          region,
          rank,
          metadata: {
            version: FINAL_RANKING_VERSION,
            components: row.components,
          },
        });
        rank += 1;
      }

      await deps.repos.ranking.mergeRankingRunMetadata(finalRun.id, {
        finalizedAt: new Date().toISOString(),
        candidateCount: scored.length,
        selectedCount: selected.length,
      });

      await deps.repos.ranking.updateRankingRunStatus(finalRun.id, "COMPLETED", {
        completedAt: new Date(),
      });

      return {
        ok: true,
        rankingRunId: finalRun.id,
        topCount: selected.length,
      };
    },

    async validateFinalCandidate(eventId: string): Promise<
      | {
          ok: true;
          event: NonNullable<
            Awaited<ReturnType<typeof deps.repos.event.getEventById>>
          >;
          evaluation: NonNullable<
            Awaited<
              ReturnType<typeof deps.repos.evaluation.getLatestEventEvaluation>
            >
          >;
          verification: NonNullable<
            Awaited<
              ReturnType<typeof deps.repos.verification.getLatestEventVerification>
            >
          >;
          narrativeIds: string[];
        }
      | { ok: false; reason: string }
    > {
      const event = await deps.repos.event.getEventById(eventId);
      if (!event || event.status !== "ACTIVE") {
        return { ok: false, reason: "event_missing" };
      }
      if (!event.eventDate) {
        return { ok: false, reason: "event_date_missing" };
      }
      if (!event.region) {
        return { ok: false, reason: "region_missing" };
      }

      const graph = await deps.repos.event.getEventEvidenceGraph(eventId);
      if (!graph || graph.eventDocuments.length === 0) {
        return { ok: false, reason: "no_sourced_documents" };
      }

      const evaluation =
        await deps.repos.evaluation.getLatestEventEvaluation(eventId);
      const verification =
        await deps.repos.verification.getLatestEventVerification(eventId);
      if (!evaluation || !verification) {
        return { ok: false, reason: "verification_or_evaluation_missing" };
      }

      const reasoning =
        evaluation.whyItMatters ??
        evaluation.whatChanged ??
        verification.reasoning ??
        evaluation.reasoning;
      if (!reasoning || reasoning.trim().length < 8) {
        return { ok: false, reason: "reasoning_missing" };
      }

      const narrativeIds = graph.eventNarratives.map(
        (row) => row.narrativeId,
      );

      return {
        ok: true,
        event,
        evaluation,
        verification,
        narrativeIds,
      };
    },
  };
}

export const finalRankingService = createFinalRankingService(
  defaultNewsServiceDeps,
);
