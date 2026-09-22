import type { CoverageGapStatus, Region } from "@/db/generated/client";
import { prisma } from "@/db";
import { toNullableJson } from "@/repositories/json";

export async function createCoverageGapRun(input: {
  rankingRunId: string;
  discoveryRunId?: string;
  region: Region;
  metadata?: Record<string, unknown>;
}) {
  return prisma.coverageGapRun.create({
    data: {
      rankingRunId: input.rankingRunId,
      discoveryRunId: input.discoveryRunId,
      region: input.region,
      status: "PENDING",
      metadata: toNullableJson(input.metadata),
    },
  });
}

export async function getCoverageGapRunById(id: string) {
  return prisma.coverageGapRun.findUnique({ where: { id } });
}

export async function findCoverageGapRunByRankingRun(rankingRunId: string) {
  return prisma.coverageGapRun.findFirst({
    where: { rankingRunId },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateCoverageGapRunStatus(
  id: string,
  status: CoverageGapStatus,
  timestamps?: { startedAt?: Date; completedAt?: Date },
) {
  return prisma.coverageGapRun.update({
    where: { id },
    data: {
      status,
      startedAt: timestamps?.startedAt,
      completedAt: timestamps?.completedAt,
    },
  });
}

export async function createCoverageGapCandidate(input: {
  coverageGapRunId: string;
  rawSearchResultId?: string;
  documentId?: string;
  eventId?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.coverageGapCandidate.create({
    data: {
      coverageGapRunId: input.coverageGapRunId,
      rawSearchResultId: input.rawSearchResultId,
      documentId: input.documentId,
      eventId: input.eventId,
      status: input.status ?? "PENDING",
      metadata: toNullableJson(input.metadata),
    },
  });
}
