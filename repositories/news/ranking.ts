import type {
  DiscoveryPeriod,
  EvaluatorType,
  RankingStatus,
  Region,
} from "@/db/generated/client";
import { prisma } from "@/db";
import { toNullableJson } from "@/repositories/json";
import type { EventRankingUpsertInput } from "@/domain/news/schemas/ranking";

export type CreateRankingRunInput = {
  discoveryRunId: string;
  region: Region;
  period: DiscoveryPeriod;
  rankingVersion: string;
  methodology?: string;
  metadata?: Record<string, unknown>;
};

export async function createRankingRun(input: CreateRankingRunInput) {
  return prisma.rankingRun.create({
    data: {
      discoveryRunId: input.discoveryRunId,
      region: input.region,
      period: input.period,
      rankingVersion: input.rankingVersion,
      status: "PENDING",
      methodology: input.methodology,
      metadata: toNullableJson(input.metadata),
    },
  });
}

export async function getRankingRunById(id: string) {
  return prisma.rankingRun.findUnique({ where: { id } });
}

export async function findRankingRunForDiscovery(
  discoveryRunId: string,
  region: Region,
  rankingVersion: string,
) {
  return prisma.rankingRun.findFirst({
    where: { discoveryRunId, region, rankingVersion },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateRankingRunStatus(
  id: string,
  status: RankingStatus,
  timestamps?: { startedAt?: Date; completedAt?: Date },
) {
  return prisma.rankingRun.update({
    where: { id },
    data: {
      status,
      startedAt: timestamps?.startedAt,
      completedAt: timestamps?.completedAt,
    },
  });
}

export async function mergeRankingRunMetadata(
  id: string,
  patch: Record<string, unknown>,
) {
  const existing = await getRankingRunById(id);
  const current =
    existing?.metadata &&
    typeof existing.metadata === "object" &&
    !Array.isArray(existing.metadata)
      ? (existing.metadata as Record<string, unknown>)
      : {};

  return prisma.rankingRun.update({
    where: { id },
    data: {
      metadata: toNullableJson({
        ...current,
        ...patch,
      }),
    },
  });
}

export async function listEventRankingsForRun(rankingRunId: string) {
  return prisma.eventRanking.findMany({
    where: { rankingRunId },
    orderBy: { rank: "asc" },
  });
}

export async function listRankingEvaluationsForRun(
  rankingRunId: string,
  evaluatorType: EvaluatorType,
) {
  return prisma.rankingEvaluation.findMany({
    where: { rankingRunId, evaluatorType },
    orderBy: { createdAt: "asc" },
  });
}

export async function findRankingDisagreementForEvent(
  rankingRunId: string,
  eventId: string,
) {
  return prisma.rankingDisagreement.findFirst({
    where: { rankingRunId, eventId },
    orderBy: { createdAt: "desc" },
  });
}

/** Idempotent per (rankingRunId, eventId) via DB unique constraint. */
export async function upsertEventRanking(input: EventRankingUpsertInput) {
  return prisma.eventRanking.upsert({
    where: {
      rankingRunId_eventId: {
        rankingRunId: input.rankingRunId,
        eventId: input.eventId,
      },
    },
    create: {
      rankingRunId: input.rankingRunId,
      eventId: input.eventId,
      rank: input.rank,
      finalScore: input.finalScore,
      importanceScore: input.importanceScore,
      noveltyScore: input.noveltyScore,
      evidenceScore: input.evidenceScore,
      narrativeScore: input.narrativeScore,
      contentScore: input.contentScore,
      reasoning: input.reasoning,
    },
    update: {
      rank: input.rank,
      finalScore: input.finalScore,
      importanceScore: input.importanceScore,
      noveltyScore: input.noveltyScore,
      evidenceScore: input.evidenceScore,
      narrativeScore: input.narrativeScore,
      contentScore: input.contentScore,
      reasoning: input.reasoning,
    },
  });
}

export async function createRankingEvaluation(input: {
  rankingRunId: string;
  eventId: string;
  evaluatorType: EvaluatorType;
  finalScore?: number;
  importanceScore?: number;
  noveltyScore?: number;
  evidenceScore?: number;
  narrativeScore?: number;
  contentScore?: number;
  reasoning?: string;
  model?: string;
  promptVersion?: string;
}) {
  return prisma.rankingEvaluation.create({
    data: {
      rankingRunId: input.rankingRunId,
      eventId: input.eventId,
      evaluatorType: input.evaluatorType,
      finalScore: input.finalScore,
      importanceScore: input.importanceScore,
      noveltyScore: input.noveltyScore,
      evidenceScore: input.evidenceScore,
      narrativeScore: input.narrativeScore,
      contentScore: input.contentScore,
      reasoning: input.reasoning,
      model: input.model,
      promptVersion: input.promptVersion,
    },
  });
}

export async function createRankingDisagreement(input: {
  rankingRunId: string;
  eventId: string;
  evaluatorTypeA: EvaluatorType;
  evaluatorTypeB: EvaluatorType;
  dimension: string;
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  explanation?: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.rankingDisagreement.create({
    data: {
      rankingRunId: input.rankingRunId,
      eventId: input.eventId,
      evaluatorTypeA: input.evaluatorTypeA,
      evaluatorTypeB: input.evaluatorTypeB,
      dimension: input.dimension,
      severity: input.severity,
      explanation: input.explanation,
      metadata: toNullableJson(input.metadata),
    },
  });
}

export async function listRankingRunsForDiscovery(discoveryRunId: string) {
  return prisma.rankingRun.findMany({
    where: { discoveryRunId },
    orderBy: { createdAt: "asc" },
  });
}

export async function listTopStorySelectionsForRankingRun(rankingRunId: string) {
  return prisma.topStorySelection.findMany({
    where: { rankingRunId },
    orderBy: { rank: "asc" },
  });
}

export async function listTopStorySelectionsForDiscoveryRun(
  discoveryRunId: string,
  region: Region,
) {
  return prisma.topStorySelection.findMany({
    where: {
      region,
      rankingRun: {
        discoveryRunId,
        rankingVersion: "final-v1",
      },
    },
    orderBy: { rank: "asc" },
  });
}

export async function createTopStorySelection(input: {
  rankingRunId: string;
  eventId: string;
  region: Region;
  rank: number;
  metadata?: Record<string, unknown>;
}) {
  return prisma.topStorySelection.create({
    data: {
      rankingRunId: input.rankingRunId,
      eventId: input.eventId,
      region: input.region,
      rank: input.rank,
      metadata: toNullableJson(input.metadata),
    },
  });
}
