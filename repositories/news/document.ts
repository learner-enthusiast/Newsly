import type { ScrapeStatus } from "@/db/generated/client";
import { prisma } from "@/db";
import { toNullableJson } from "@/repositories/json";
import type { DocumentCreateInput } from "@/domain/news/schemas/document";

export async function findDocumentByNormalizedUrl(normalizedUrl: string) {
  return prisma.document.findUnique({
    where: { normalizedUrl },
  });
}

export async function createDocument(input: DocumentCreateInput) {
  return prisma.document.create({
    data: {
      sourceId: input.sourceId,
      url: input.url,
      canonicalUrl: input.canonicalUrl,
      normalizedUrl: input.normalizedUrl,
      title: input.title,
      author: input.author,
      publishedAt: input.publishedAt,
      content: input.content,
      contentHash: input.contentHash,
      scrapeStatus: "PENDING",
      metadata: toNullableJson(input.metadata),
    },
  });
}

export async function getDocumentById(id: string) {
  return prisma.document.findUnique({ where: { id } });
}

export async function listDocumentsForDiscoveryRun(discoveryRunId: string) {
  return prisma.document.findMany({
    where: {
      rawSearchResults: {
        some: {
          searchExecution: { discoveryRunId },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function updateDocumentScrapeStatus(
  id: string,
  scrapeStatus: ScrapeStatus,
  scrapedAt?: Date,
) {
  return prisma.document.update({
    where: { id },
    data: {
      scrapeStatus,
      scrapedAt,
    },
  });
}
