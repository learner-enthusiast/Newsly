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
