import type { SearchProvider, SearchStatus, SearchType } from "@/db/generated/client";
import type { Region } from "@/db/generated/client";
import { prisma } from "@/db";
import { toNullableJson } from "@/repositories/json";

export type CreateSearchExecutionInput = {
  discoveryRunId: string;
  provider: SearchProvider;
  searchType: SearchType;
  region: Region;
  query?: string;
  metadata?: Record<string, unknown>;
};

export async function createSearchExecution(input: CreateSearchExecutionInput) {
  return prisma.searchExecution.create({
    data: {
      discoveryRunId: input.discoveryRunId,
      provider: input.provider,
      searchType: input.searchType,
      region: input.region,
      status: "PENDING",
      query: input.query,
      metadata: toNullableJson(input.metadata),
    },
  });
}

export async function getSearchExecutionById(id: string) {
  return prisma.searchExecution.findUnique({ where: { id } });
}

export async function listSearchExecutionsByDiscoveryRun(discoveryRunId: string) {
  return prisma.searchExecution.findMany({
    where: { discoveryRunId },
    orderBy: { createdAt: "asc" },
  });
}

export async function updateSearchExecutionStatus(
  id: string,
  status: SearchStatus,
  timestamps?: { startedAt?: Date; completedAt?: Date },
  metadataPatch?: Record<string, unknown>,
) {
  const existing = await prisma.searchExecution.findUnique({ where: { id } });
  const mergedMetadata =
    metadataPatch && existing?.metadata && typeof existing.metadata === "object"
      ? { ...(existing.metadata as Record<string, unknown>), ...metadataPatch }
      : metadataPatch;

  return prisma.searchExecution.update({
    where: { id },
    data: {
      status,
      startedAt: timestamps?.startedAt,
      completedAt: timestamps?.completedAt,
      ...(mergedMetadata
        ? { metadata: toNullableJson(mergedMetadata) }
        : {}),
    },
  });
}

export async function findSearchExecutionByExecutionKey(
  discoveryRunId: string,
  executionKey: string,
) {
  return prisma.searchExecution.findFirst({
    where: {
      discoveryRunId,
      metadata: {
        path: ["executionKey"],
        equals: executionKey,
      },
    },
  });
}
