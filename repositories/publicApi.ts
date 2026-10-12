/**
 * Keyset-paginated reads for the public API v1. Every list is ordered by
 * (timestamp desc, id desc) and fetches `limit + 1` rows so the caller can
 * tell whether another page exists (see `lib/api/v1/cursor.ts`).
 */

import type { Prisma, ResearchAssetType, StockResearchStatus } from "@/db/generated/client";
import { prisma } from "@/db";
import { afterCursorWhere } from "@/lib/api/v1/cursor";
import { publicNewsStoryWhere } from "@/services/news/newsStoryAccess";

type CursorValue = { t: Date | null; id: string } | null;

export const publicStoryListInclude = {
  newsRequest: { select: { scope: true } },
  sources: {
    select: { id: true, url: true, title: true, domain: true },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.NewsStoryInclude;

export type PublicStoryRow = Prisma.NewsStoryGetPayload<{ include: typeof publicStoryListInclude }>;

export async function listPublicStoriesPage(input: {
  region?: "local" | "world";
  location?: string;
  category?: string;
  publishedFrom?: Date;
  /** Inclusive upper bound. */
  publishedTo?: Date;
  q?: string;
  limit: number;
  cursor: CursorValue;
}): Promise<PublicStoryRow[]> {
  const and: Prisma.NewsStoryWhereInput[] = [publicNewsStoryWhere];

  if (input.region) {
    and.push({
      isUserCreated: false,
      newsRequest: { scope: { in: [input.region, "both"] } },
    });
  }
  if (input.location) {
    and.push({ location: { contains: input.location, mode: "insensitive" } });
  }
  if (input.category) {
    and.push({ category: { equals: input.category, mode: "insensitive" } });
  }
  if (input.publishedFrom || input.publishedTo) {
    and.push({
      publishedAt: {
        ...(input.publishedFrom ? { gte: input.publishedFrom } : {}),
        ...(input.publishedTo ? { lte: input.publishedTo } : {}),
      },
    });
  }
  if (input.q) {
    and.push({
      OR: [
        { title: { contains: input.q, mode: "insensitive" } },
        { description: { contains: input.q, mode: "insensitive" } },
        { summary: { contains: input.q, mode: "insensitive" } },
      ],
    });
  }
  and.push(afterCursorWhere("publishedAt", input.cursor, { nullable: true }));

  return prisma.newsStory.findMany({
    where: { AND: and },
    orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
    take: input.limit + 1,
    include: publicStoryListInclude,
  });
}

/** One public story, or null when it doesn't exist or isn't public. */
export function getPublicStory(id: string): Promise<PublicStoryRow | null> {
  return prisma.newsStory.findFirst({
    where: { AND: [{ id }, publicNewsStoryWhere] },
    include: publicStoryListInclude,
  });
}

export function listBriefingsPage(input: {
  userId: string;
  status?: "pending" | "success" | "failed";
  limit: number;
  cursor: CursorValue;
}) {
  return prisma.newsRequest.findMany({
    where: {
      AND: [
        { userId: input.userId, isEdition: false },
        input.status ? { status: input.status } : {},
        afterCursorWhere("createdAt", input.cursor),
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    include: { _count: { select: { stories: true } } },
  });
}

export function listResearchPage(input: {
  userId: string;
  assetType?: ResearchAssetType;
  statuses?: StockResearchStatus[];
  limit: number;
  cursor: CursorValue;
}) {
  return prisma.stockResearch.findMany({
    where: {
      AND: [
        { userId: input.userId },
        input.assetType ? { assetType: input.assetType } : {},
        input.statuses ? { status: { in: input.statuses } } : {},
        afterCursorWhere("createdAt", input.cursor),
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
  });
}
