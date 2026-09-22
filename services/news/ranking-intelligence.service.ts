import { createHash } from "node:crypto";
import { NEWS_EVENTS } from "@/domain/news/events";
import type { Region } from "@/db/generated/client";
import { regionTargetsForRequest } from "@/providers/search-provider";
import type { StageResult } from "@/domain/news/types/pipeline";
import type { NewsServiceDeps } from "@/services/news/deps";
import { defaultNewsServiceDeps } from "@/services/news/deps";
import { createDocumentIngestionService } from "@/services/news/document-ingestion.service";
import { createDocumentUnderstandingService } from "@/services/news/document-understanding.service";
import { createEventIntelligenceService } from "@/services/news/event-intelligence.service";
import { createEvidenceIntelligenceService } from "@/services/news/evidence-intelligence.service";
import {
  COVERAGE_GAP_PROMPT_VERSION,
  FINALIST_COUNT,
  INDEPENDENT_RANKER_PROMPT_VERSION,
  LLM_PREPOOL_SIZE,
  PRIMARY_CANDIDATE_POOL_SIZE,
  PRIMARY_RANKER_PROMPT_VERSION,
  RANKING_VERSION,
  RANK_DISAGREEMENT_REVIEW_THRESHOLD,
  SCORE_DISAGREEMENT_REVIEW_THRESHOLD,
} from "@/services/news/ranking/constants";
import {
  evaluationToRecord,
  eventWithinDiscoveryPeriod,
  heuristicPreRankScore,
  verificationToRecord,
} from "@/services/news/ranking/event-context";
import {
  buildCoverageGapPrompt,
  buildIndependentRankingPrompt,
  buildPrimaryRankingPrompt,
  COVERAGE_GAP_SYSTEM,
  INDEPENDENT_RANKER_SYSTEM,
  PRIMARY_RANKER_SYSTEM,
} from "@/services/news/ranking/prompt";
import {
  coverageGapQuerySchema,
  independentRankingOutputSchema,
  primaryRankingOutputSchema,
} from "@/services/news/ranking/schemas";

export type RankingChallengePlan =
  | { ok: true; discoveryRunId: string; regions: Region[] }
  | { ok: false; discoveryRunId: string; reason: string };

export type RegionRankingResult = {
  region: Region;
  rankingRunId: string;
  status: "completed" | "failed" | "skipped";
  error?: string;
};

function disagreementSeverity(rankDifference: number, requiresReview: boolean) {
  if (!requiresReview) {
    return "LOW" as const;
  }
  if (rankDifference >= 5) {
    return "CRITICAL" as const;
  }
  if (rankDifference >= 3) {
    return "HIGH" as const;
  }
  return "MEDIUM" as const;
}

export function createRankingIntelligenceService(deps: NewsServiceDeps) {
  const ingestion = createDocumentIngestionService(deps);
  const understanding = createDocumentUnderstandingService(deps);
  const eventIntel = createEventIntelligenceService(deps);
  const evidenceIntel = createEvidenceIntelligenceService(deps);

  return {
    async buildRankingChallengePlan(
      discoveryRunId: string,
    ): Promise<RankingChallengePlan> {
      const run = await deps.repos.discoveryRun.getDiscoveryRunById(
        discoveryRunId,
      );
      if (!run) {
        return { ok: false, discoveryRunId, reason: "discovery_run_not_found" };
      }

      return {
        ok: true,
        discoveryRunId,
        regions: regionTargetsForRequest(run.region),
      };
    },

    async markRankingChallengeRunning(
      discoveryRunId: string,
    ): Promise<StageResult> {
      await deps.repos.discoveryRun.mergeDiscoveryRunMetadata(discoveryRunId, {
        pipelineStage: "ranking_primary",
        pipelineStageUpdatedAt: new Date().toISOString(),
      });
      return { ok: true, discoveryRunId };
    },

    async runPrimaryRankingForRegion(
      discoveryRunId: string,
      region: Region,
    ): Promise<RegionRankingResult> {
      const llm = deps.providers.llm;
      const run = await deps.repos.discoveryRun.getDiscoveryRunById(
        discoveryRunId,
      );
      if (!run || !llm) {
        return {
          region,
          rankingRunId: "",
          status: "failed",
          error: run ? "llm_provider_not_configured" : "discovery_run_not_found",
        };
      }

      let rankingRun = await deps.repos.ranking.findRankingRunForDiscovery(
        discoveryRunId,
        region,
        RANKING_VERSION,
      );

      if (
        rankingRun?.metadata &&
        typeof rankingRun.metadata === "object" &&
        (rankingRun.metadata as Record<string, unknown>).primaryCompletedAt
      ) {
        return {
          region,
          rankingRunId: rankingRun.id,
          status: "skipped",
        };
      }

      rankingRun =
        rankingRun ??
        (await deps.repos.ranking.createRankingRun({
          discoveryRunId,
          region,
          period: run.period,
          rankingVersion: RANKING_VERSION,
          methodology: "primary_llm_ranker_v1",
        }));

      await deps.repos.ranking.updateRankingRunStatus(rankingRun.id, "RUNNING", {
        startedAt: new Date(),
      });

      const events =
        await deps.repos.event.listEventsForDiscoveryRunInRegion(
          discoveryRunId,
          region,
        );

      const anchorDate = run.endDate ?? new Date();
      const eligible = events.filter((event) =>
        eventWithinDiscoveryPeriod({
          eventDate: event.eventDate,
          period: run.period,
          startDate: run.startDate,
          endDate: run.endDate,
          anchorDate,
        }),
      );

      const scored: Array<{
        event: (typeof eligible)[number];
        evaluation: Awaited<
          ReturnType<typeof deps.repos.evaluation.getLatestEventEvaluation>
        >;
        verification: Awaited<
          ReturnType<typeof deps.repos.verification.getLatestEventVerification>
        >;
        preScore: number;
      }> = [];

      for (const event of eligible) {
        const evaluation =
          await deps.repos.evaluation.getLatestEventEvaluation(event.id);
        const verification =
          await deps.repos.verification.getLatestEventVerification(event.id);
        if (!evaluation) {
          continue;
        }
        scored.push({
          event,
          evaluation,
          verification,
          preScore: heuristicPreRankScore({
            evaluation,
            verification,
            eventDate: event.eventDate,
            period: run.period,
            anchorDate,
          }),
        });
      }

      scored.sort((a, b) => b.preScore - a.preScore);
      const pool = scored.slice(0, LLM_PREPOOL_SIZE);

      if (pool.length === 0) {
        await deps.repos.ranking.mergeRankingRunMetadata(rankingRun.id, {
          primaryCompletedAt: new Date().toISOString(),
          primaryCandidateCount: 0,
          finalistEventIds: [],
        });
        await deps.repos.ranking.updateRankingRunStatus(
          rankingRun.id,
          "COMPLETED",
          { completedAt: new Date() },
        );
        return { region, rankingRunId: rankingRun.id, status: "completed" };
      }

      const model =
        process.env.OPENAI_MODEL ?? process.env.AI_MODEL ?? "gpt-4o-mini";

      const promptEvents = pool.map((row, index) => ({
        index,
        title: row.event.title,
        eventType: row.event.eventType,
        eventDate: row.event.eventDate?.toISOString(),
        narratives: row.event.eventNarratives.map(
          (link) => link.narrative.title,
        ),
        evaluation: evaluationToRecord(row.evaluation),
        verification: verificationToRecord(row.verification),
      }));

      try {
        const parsed = primaryRankingOutputSchema.parse(
          await llm.generateObject({
            schema: primaryRankingOutputSchema,
            schemaName: "PrimaryEventRanking",
            system: PRIMARY_RANKER_SYSTEM,
            prompt: buildPrimaryRankingPrompt({
              period: run.period,
              region,
              events: promptEvents,
            }),
            model,
          }),
        );

        const ordered = parsed.rankedEvents
          .map((row) => ({
            ...row,
            event: pool[row.eventIndex]?.event,
          }))
          .filter((row) => row.event)
          .slice(0, PRIMARY_CANDIDATE_POOL_SIZE);

        let rank = 1;
        for (const row of ordered) {
          if (!row.event) {
            continue;
          }
          await deps.repos.ranking.upsertEventRanking({
            rankingRunId: rankingRun.id,
            eventId: row.event.id,
            rank,
            finalScore: row.finalScore,
            importanceScore: row.importanceScore,
            noveltyScore: row.noveltyScore,
            evidenceScore: row.evidenceScore,
            narrativeScore: row.narrativeScore,
            contentScore: row.contentScore,
            reasoning: row.reasoning,
          });
          rank += 1;
        }

        const finalistEventIds = ordered
          .slice(0, FINALIST_COUNT)
          .map((row) => row.event!.id);

        await deps.repos.ranking.mergeRankingRunMetadata(rankingRun.id, {
          primaryCompletedAt: new Date().toISOString(),
          primaryCandidateCount: rank - 1,
          finalistEventIds,
          primaryModel: model,
          primaryPromptVersion: PRIMARY_RANKER_PROMPT_VERSION,
        });

        await deps.events.send(NEWS_EVENTS.RANKING_PRIMARY_COMPLETED, {
          rankingRunId: rankingRun.id,
        });

        return { region, rankingRunId: rankingRun.id, status: "completed" };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "primary_ranking_failed";
        await deps.repos.ranking.updateRankingRunStatus(rankingRun.id, "FAILED");
        return {
          region,
          rankingRunId: rankingRun.id,
          status: "failed",
          error: message,
        };
      }
    },

    async runIndependentRankingForRegion(
      rankingRunId: string,
    ): Promise<RegionRankingResult> {
      const llm = deps.providers.llm;
      const rankingRun = await deps.repos.ranking.getRankingRunById(rankingRunId);
      if (!rankingRun || !llm) {
        return {
          region: rankingRun?.region ?? "INDIA",
          rankingRunId,
          status: "failed",
          error: rankingRun
            ? "llm_provider_not_configured"
            : "ranking_run_not_found",
        };
      }

      const metadata = rankingRun.metadata as Record<string, unknown> | null;
      if (metadata?.independentCompletedAt) {
        return {
          region: rankingRun.region,
          rankingRunId,
          status: "skipped",
        };
      }

      const finalistEventIds = Array.isArray(metadata?.finalistEventIds)
        ? (metadata.finalistEventIds as string[])
        : [];

      if (finalistEventIds.length === 0) {
        await deps.repos.ranking.mergeRankingRunMetadata(rankingRunId, {
          independentCompletedAt: new Date().toISOString(),
        });
        return {
          region: rankingRun.region,
          rankingRunId,
          status: "completed",
        };
      }

      const finalists = await Promise.all(
        finalistEventIds.map(async (eventId) => {
          const event = await deps.repos.event.getEventById(eventId);
          if (!event) {
            return null;
          }
          const evaluation =
            await deps.repos.evaluation.getLatestEventEvaluation(eventId);
          const verification =
            await deps.repos.verification.getLatestEventVerification(eventId);
          const graph = await deps.repos.event.getEventEvidenceGraph(eventId);
          return {
            event,
            evaluation,
            verification,
            narratives:
              graph?.eventNarratives.map((row) => row.narrative.title) ?? [],
          };
        }),
      );

      const rows = finalists.filter(Boolean) as NonNullable<
        (typeof finalists)[number]
      >[];

      const model =
        process.env.OPENAI_MODEL ?? process.env.AI_MODEL ?? "gpt-4o-mini";

      const promptEvents = rows.map((row, index) => ({
        index,
        title: row.event.title,
        eventType: row.event.eventType,
        eventDate: row.event.eventDate?.toISOString(),
        description: row.event.description ?? undefined,
        narratives: row.narratives,
        evaluation: evaluationToRecord(row.evaluation),
        verification: verificationToRecord(row.verification),
      }));

      try {
        const parsed = independentRankingOutputSchema.parse(
          await llm.generateObject({
            schema: independentRankingOutputSchema,
            schemaName: "IndependentEventRanking",
            system: INDEPENDENT_RANKER_SYSTEM,
            prompt: buildIndependentRankingPrompt({
              period: rankingRun.period,
              region: rankingRun.region,
              events: promptEvents,
            }),
            model,
          }),
        );

        const independentRanks: Record<string, number> = {};

        for (const [orderIndex, row] of parsed.rankedEvents.entries()) {
          const finalist = rows[row.eventIndex];
          if (!finalist) {
            continue;
          }
          const independentRank = orderIndex + 1;
          independentRanks[finalist.event.id] = independentRank;

          await deps.repos.ranking.createRankingEvaluation({
            rankingRunId,
            eventId: finalist.event.id,
            evaluatorType: "INDEPENDENT_RANKER",
            finalScore: row.finalScore,
            importanceScore: row.importanceScore,
            noveltyScore: row.noveltyScore,
            evidenceScore: row.evidenceScore,
            narrativeScore: row.narrativeScore,
            contentScore: row.contentScore,
            reasoning: row.reasoning,
            model,
            promptVersion: INDEPENDENT_RANKER_PROMPT_VERSION,
          });
        }

        await deps.repos.ranking.mergeRankingRunMetadata(rankingRunId, {
          independentCompletedAt: new Date().toISOString(),
          independentRanks,
          independentModel: model,
          independentPromptVersion: INDEPENDENT_RANKER_PROMPT_VERSION,
        });

        await deps.events.send(NEWS_EVENTS.RANKING_INDEPENDENT_COMPLETED, {
          rankingRunId,
        });

        return {
          region: rankingRun.region,
          rankingRunId,
          status: "completed",
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "independent_ranking_failed";
        return {
          region: rankingRun.region,
          rankingRunId,
          status: "failed",
          error: message,
        };
      }
    },

    async compareRankingDisagreements(
      rankingRunId: string,
    ): Promise<StageResult> {
      const rankingRun = await deps.repos.ranking.getRankingRunById(rankingRunId);
      if (!rankingRun) {
        return {
          ok: false,
          discoveryRunId: rankingRunId,
          reason: "ranking_run_not_found",
        };
      }

      const metadata = rankingRun.metadata as Record<string, unknown> | null;
      const independentRanks =
        metadata?.independentRanks &&
        typeof metadata.independentRanks === "object"
          ? (metadata.independentRanks as Record<string, number>)
          : {};

      const primaryRankings =
        await deps.repos.ranking.listEventRankingsForRun(rankingRunId);
      const primaryByEvent = new Map(
        primaryRankings.map((row) => [row.eventId, row]),
      );

      for (const [eventId, independentRank] of Object.entries(
        independentRanks,
      )) {
        const primary = primaryByEvent.get(eventId);
        if (!primary) {
          continue;
        }

        const existing =
          await deps.repos.ranking.findRankingDisagreementForEvent(
            rankingRunId,
            eventId,
          );
        if (existing) {
          continue;
        }

        const primaryRank = primary.rank;
        const rankDifference = Math.abs(primaryRank - independentRank);
        const primaryScore = primary.finalScore
          ? Number(primary.finalScore)
          : 0;
        const independentEvals =
          await deps.repos.ranking.listRankingEvaluationsForRun(
            rankingRunId,
            "INDEPENDENT_RANKER",
          );
        const independentEval = independentEvals.find(
          (row) => row.eventId === eventId,
        );
        const independentScore = independentEval?.finalScore
          ? Number(independentEval.finalScore)
          : 0;
        const scoreDifference = Math.abs(primaryScore - independentScore);
        const requiresReview =
          rankDifference >= RANK_DISAGREEMENT_REVIEW_THRESHOLD ||
          scoreDifference >= SCORE_DISAGREEMENT_REVIEW_THRESHOLD;

        await deps.repos.ranking.createRankingDisagreement({
          rankingRunId,
          eventId,
          evaluatorTypeA: "PRIMARY_RANKER",
          evaluatorTypeB: "INDEPENDENT_RANKER",
          dimension: "overall_rank",
          severity: disagreementSeverity(rankDifference, requiresReview),
          explanation: requiresReview
            ? `Primary rank ${primaryRank} vs independent rank ${independentRank}; score delta ${scoreDifference.toFixed(3)}.`
            : `Primary and independent ranks align within tolerance (Δrank=${rankDifference}, Δscore=${scoreDifference.toFixed(3)}).`,
          metadata: {
            rankDifference,
            scoreDifference,
            requiresReview,
            primaryRank,
            independentRank,
            primaryScore,
            independentScore,
          },
        });
      }

      await deps.repos.ranking.mergeRankingRunMetadata(rankingRunId, {
        disagreementComparedAt: new Date().toISOString(),
      });

      await deps.repos.discoveryRun.mergeDiscoveryRunMetadata(
        rankingRun.discoveryRunId,
        { pipelineStage: "ranking_independent" },
      );

      return { ok: true, discoveryRunId: rankingRun.discoveryRunId };
    },

    async runCoverageGapForRegion(rankingRunId: string): Promise<RegionRankingResult> {
      const llm = deps.providers.llm;
      const factory = deps.providers.search;
      const rankingRun = await deps.repos.ranking.getRankingRunById(rankingRunId);
      if (!rankingRun) {
        return {
          region: "INDIA",
          rankingRunId,
          status: "failed",
          error: "ranking_run_not_found",
        };
      }

      let gapRun =
        await deps.repos.coverageGap.findCoverageGapRunByRankingRun(
          rankingRunId,
        );
      gapRun =
        gapRun ??
        (await deps.repos.coverageGap.createCoverageGapRun({
          rankingRunId,
          discoveryRunId: rankingRun.discoveryRunId,
          region: rankingRun.region,
        }));

      if (
        gapRun.metadata &&
        typeof gapRun.metadata === "object" &&
        (gapRun.metadata as Record<string, unknown>).completedAt
      ) {
        return {
          region: rankingRun.region,
          rankingRunId,
          status: "skipped",
        };
      }

      await deps.repos.coverageGap.updateCoverageGapRunStatus(
        gapRun.id,
        "RUNNING",
        { startedAt: new Date() },
      );

      const primaryRankings =
        await deps.repos.ranking.listEventRankingsForRun(rankingRunId);
      const candidateTitles = primaryRankings
        .slice(0, PRIMARY_CANDIDATE_POOL_SIZE)
        .map((row) => row.eventId);

      const titleByEvent = await Promise.all(
        candidateTitles.map(async (eventId) => {
          const event = await deps.repos.event.getEventById(eventId);
          return event?.title ?? "";
        }),
      );

      const entityNames = new Set<string>();
      for (const eventId of candidateTitles.slice(0, 15)) {
        const graph = await deps.repos.event.getEventEvidenceGraph(eventId);
        for (const row of graph?.eventEntities ?? []) {
          entityNames.add(row.entity.name);
        }
      }

      const queries: string[] = [];
      if (llm) {
        try {
          const model =
            process.env.OPENAI_MODEL ?? process.env.AI_MODEL ?? "gpt-4o-mini";
          const parsed = coverageGapQuerySchema.parse(
            await llm.generateObject({
              schema: coverageGapQuerySchema,
              schemaName: "CoverageGapQueries",
              system: COVERAGE_GAP_SYSTEM,
              prompt: buildCoverageGapPrompt({
                region: rankingRun.region,
                period: rankingRun.period,
                candidateTitles: titleByEvent.filter(Boolean),
                entityNames: [...entityNames].slice(0, 25),
              }),
              model,
            }),
          );
          queries.push(...parsed.queries.map((row) => row.query));
        } catch {
          queries.push(
            `${rankingRun.region} market news ${rankingRun.period.toLowerCase()} unexplored sectors`,
            `${rankingRun.region} regulatory filing corporate announcement`,
          );
        }
      } else {
        queries.push(
          `${rankingRun.region} business news ${rankingRun.period.toLowerCase()}`,
        );
      }

      const discoveryRunId = rankingRun.discoveryRunId;
      const newRawResultIds: string[] = [];
      const candidateEventIds = new Set(candidateTitles);

      if (factory) {
        for (const query of queries) {
          const executionKey = createHash("sha256")
            .update(
              `coverage-gap|${rankingRunId}|${query}|${rankingRun.region}`,
            )
            .digest("hex")
            .slice(0, 32);

          const existing =
            await deps.repos.searchExecution.findSearchExecutionByExecutionKey(
              discoveryRunId,
              executionKey,
            );

          const execution =
            existing ??
            (await deps.repos.searchExecution.createSearchExecution({
              discoveryRunId,
              provider: "SERPAPI",
              searchType: "GOOGLE_NEWS",
              region: rankingRun.region,
              query,
              metadata: {
                executionKey,
                dimension: "coverage_gap",
                source: "ranking_coverage_gap",
              },
            }));

          if (execution.status !== "COMPLETED") {
            const provider = factory("SERPAPI");
            const hits = await provider.search({
              discoveryRunId,
              provider: "SERPAPI",
              searchType: "GOOGLE_NEWS",
              region: rankingRun.region,
              query,
              metadata: { executionKey, dimension: "coverage_gap" },
            });

            for (const hit of hits) {
              const exists =
                await deps.repos.rawSearchResult.rawSearchResultExists(
                  execution.id,
                  hit.url,
                );
              if (exists) {
                continue;
              }
              const raw = await deps.repos.rawSearchResult.createRawSearchResult(
                {
                  searchExecutionId: execution.id,
                  url: hit.url,
                  title: hit.title,
                  snippet: hit.snippet,
                  position: hit.position,
                  publishedAt: hit.publishedAt,
                  providerPayload: hit.raw,
                  metadata: { coverageGapRunId: gapRun.id },
                },
              );
              newRawResultIds.push(raw.id);
            }

            await deps.repos.searchExecution.updateSearchExecutionStatus(
              execution.id,
              "COMPLETED",
              { completedAt: new Date() },
              { resultCount: hits.length },
            );
          } else {
            const existingRaw =
              await deps.repos.rawSearchResult.listRawSearchResultsByDiscoveryRun(
                discoveryRunId,
              );
            for (const raw of existingRaw) {
              if (
                raw.metadata &&
                typeof raw.metadata === "object" &&
                (raw.metadata as Record<string, unknown>).coverageGapRunId ===
                  gapRun.id
              ) {
                newRawResultIds.push(raw.id);
              }
            }
          }
        }
      }

      const ingestPlan = await ingestion.buildIngestPlan(discoveryRunId);
      const newDocumentIds: string[] = [];

      if (ingestPlan.ok) {
        const gapGroups = ingestPlan.groups.filter((group) =>
          group.rawSearchResultIds.some((id) => newRawResultIds.includes(id)),
        );

        for (const group of gapGroups) {
          const ingestResult = await ingestion.ingestUrlGroup(group);
          if (ingestResult.documentId) {
            newDocumentIds.push(ingestResult.documentId);
            const rawId = group.rawSearchResultIds[0];
            if (rawId) {
              await deps.repos.coverageGap.createCoverageGapCandidate({
                coverageGapRunId: gapRun.id,
                rawSearchResultId: rawId,
                documentId: ingestResult.documentId,
                status: "INGESTED",
                metadata: { pipeline: "coverage_gap" },
              });
            }
          }
        }
      }

      for (const documentId of newDocumentIds) {
        await understanding.understandDocument(documentId);
        await eventIntel.processDocumentEvents(discoveryRunId, documentId);

        const document = await deps.repos.document.getDocumentById(documentId);
        const eventIds =
          document?.metadata &&
          typeof document.metadata === "object" &&
          !Array.isArray(document.metadata)
            ? ((document.metadata as Record<string, unknown>).eventExtraction as
                | Record<string, unknown>
                | undefined)?.eventIds
            : undefined;

        if (Array.isArray(eventIds)) {
          for (const eventId of eventIds) {
            if (typeof eventId !== "string") {
              continue;
            }
            if (candidateEventIds.has(eventId)) {
              continue;
            }
            await evidenceIntel.processEventEvidence(discoveryRunId, eventId);
            await deps.repos.coverageGap.createCoverageGapCandidate({
              coverageGapRunId: gapRun.id,
              documentId,
              eventId,
              status: "EVALUATED",
              metadata: {
                note: "Gap candidate completed mini-pipeline; not auto-finalist",
              },
            });
          }
        }
      }

      await deps.repos.coverageGap.updateCoverageGapRunStatus(
        gapRun.id,
        "COMPLETED",
        { completedAt: new Date() },
      );

      await deps.repos.coverageGap.mergeCoverageGapRunMetadata(gapRun.id, {
        completedAt: new Date().toISOString(),
        queries,
        newRawResults: newRawResultIds.length,
        newDocuments: newDocumentIds.length,
        promptVersion: COVERAGE_GAP_PROMPT_VERSION,
      });

      return {
        region: rankingRun.region,
        rankingRunId,
        status: "completed",
      };
    },

    async finalizeRankingChallenge(
      discoveryRunId: string,
      regionResults: RegionRankingResult[],
    ): Promise<StageResult> {
      const run = await deps.repos.discoveryRun.getDiscoveryRunById(
        discoveryRunId,
      );
      if (!run) {
        return { ok: false, discoveryRunId, reason: "discovery_run_not_found" };
      }

      const prior = run.metadata as Record<string, unknown> | null;
      if (
        prior?.rankingChallenge &&
        typeof prior.rankingChallenge === "object" &&
        typeof (prior.rankingChallenge as Record<string, unknown>)
          .coverageCompletedAt === "string"
      ) {
        return { ok: true, discoveryRunId };
      }

      await deps.repos.discoveryRun.mergeDiscoveryRunMetadata(discoveryRunId, {
        pipelineStage: "ranking_coverage",
        pipelineStageUpdatedAt: new Date().toISOString(),
        rankingChallenge: {
          coverageCompletedAt: new Date().toISOString(),
          regions: regionResults,
        },
      });

      await deps.events.send(NEWS_EVENTS.RANKING_COVERAGE_COMPLETED, {
        discoveryRunId,
      });

      return { ok: true, discoveryRunId };
    },
  };
}

export const rankingIntelligenceService = createRankingIntelligenceService(
  defaultNewsServiceDeps,
);
