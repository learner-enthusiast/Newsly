import { prisma } from "@/db";
import { toNullableJson } from "@/repositories/json";
import type { RawSearchResultInput } from "@/domain/news/schemas/discovery";

export async function createRawSearchResult(input: RawSearchResultInput) {
  return prisma.rawSearchResult.create({
    data: {
      searchExecutionId: input.searchExecutionId,
      url: input.url,
      title: input.title,
      snippet: input.snippet,
      position: input.position,
      publishedAt: input.publishedAt,
      providerPayload: toNullableJson(input.providerPayload),
      metadata: toNullableJson(input.metadata),
    },
  });
}

export async function createRawSearchResults(
  inputs: RawSearchResultInput[],
) {
  if (inputs.length === 0) {
    return [];
  }

  return prisma.$transaction(
    inputs.map((input) =>
      prisma.rawSearchResult.create({
        data: {
          searchExecutionId: input.searchExecutionId,
          url: input.url,
          title: input.title,
          snippet: input.snippet,
          position: input.position,
          publishedAt: input.publishedAt,
          providerPayload: toNullableJson(input.providerPayload),
          metadata: toNullableJson(input.metadata),
        },
      }),
    ),
  );
}

export async function getRawSearchResultById(id: string) {
  return prisma.rawSearchResult.findUnique({ where: { id } });
}

export async function listRawSearchResultsByDiscoveryRun(discoveryRunId: string) {
  return prisma.rawSearchResult.findMany({
    where: {
      searchExecution: { discoveryRunId },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function linkRawSearchResultToDocument(
  rawSearchResultId: string,
  documentId: string,
) {
  return prisma.rawSearchResult.update({
    where: { id: rawSearchResultId },
    data: { documentId },
  });
}

export async function rawSearchResultExists(
  searchExecutionId: string,
  url: string,
) {
  const existing = await prisma.rawSearchResult.findFirst({
    where: { searchExecutionId, url },
    select: { id: true },
  });
  return Boolean(existing);
}

export async function countRawSearchResultsForDiscoveryRun(
  discoveryRunId: string,
) {
  return prisma.rawSearchResult.count({
    where: {
      searchExecution: { discoveryRunId },
    },
  });
}

export async function linkRawSearchResultsToDocument(
  rawSearchResultIds: string[],
  documentId: string,
) {
  if (rawSearchResultIds.length === 0) {
    return { count: 0 };
  }
  return prisma.rawSearchResult.updateMany({
    where: { id: { in: rawSearchResultIds } },
    data: { documentId },
  });
}

export async function listRawSearchResultsWithExecution(
  discoveryRunId: string,
) {
  return prisma.rawSearchResult.findMany({
    where: {
      searchExecution: { discoveryRunId },
    },
    include: {
      searchExecution: {
        select: { region: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}
