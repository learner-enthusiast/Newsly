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

export type PersistScrapedDocumentInput = {
  sourceId: string;
  url: string;
  normalizedUrl: string;
  canonicalUrl?: string;
  title: string;
  author?: string;
  publishedAt?: Date;
  content: string;
  contentHash: string;
  scrapeStatus: ScrapeStatus;
  scrapedAt?: Date;
  metadata?: Record<string, unknown>;
};

/** Idempotent on normalizedUrl — never deduplicates by contentHash. */
export async function upsertScrapedDocument(input: PersistScrapedDocumentInput) {
  const scrapedAt = input.scrapedAt ?? new Date();
  return prisma.document.upsert({
    where: { normalizedUrl: input.normalizedUrl },
    create: {
      sourceId: input.sourceId,
      url: input.url,
      canonicalUrl: input.canonicalUrl,
      normalizedUrl: input.normalizedUrl,
      title: input.title,
      author: input.author,
      publishedAt: input.publishedAt,
      content: input.content,
      contentHash: input.contentHash,
      scrapeStatus: input.scrapeStatus,
      scrapedAt,
      metadata: toNullableJson(input.metadata),
    },
    update: {
      url: input.url,
      canonicalUrl: input.canonicalUrl,
      title: input.title,
      author: input.author,
      publishedAt: input.publishedAt,
      content: input.content,
      contentHash: input.contentHash,
      scrapeStatus: input.scrapeStatus,
      scrapedAt,
      metadata: toNullableJson(input.metadata),
    },
  });
}

export async function markDocumentScrapeRunning(normalizedUrl: string) {
  const existing = await findDocumentByNormalizedUrl(normalizedUrl);
  if (!existing) {
    return null;
  }
  if (existing.scrapeStatus === "COMPLETED") {
    return existing;
  }
  return prisma.document.update({
    where: { id: existing.id },
    data: { scrapeStatus: "RUNNING" },
  });
}
