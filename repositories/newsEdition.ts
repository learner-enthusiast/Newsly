import type { NewsEditionStatus } from "@/db/generated/client";
import { prisma } from "@/db";
import { z } from "zod";

const uuidSchema = z.uuid();

export async function findEditionByFingerprintAndPeriod(
  fingerprint: string,
  periodKey: string,
) {
  return await prisma.newsEdition.findUnique({
    where: {
      fingerprint_periodKey: { fingerprint, periodKey },
    },
    include: { newsRequest: true },
  });
}

export async function getEditionById(id: string) {
  return await prisma.newsEdition.findUnique({
    where: { id: uuidSchema.parse(id) },
    include: { newsRequest: true },
  });
}

export async function createNewsEdition(input: {
  fingerprint: string;
  periodKey: string;
  newsRequestId: string;
  targetStoryCount: number;
}) {
  return await prisma.newsEdition.create({
    data: {
      ...input,
      status: "BUILDING",
    },
  });
}

export async function patchNewsEdition(
  id: string,
  data: {
    status?: NewsEditionStatus;
    targetStoryCount?: number;
    builtStoryCount?: number;
  },
) {
  return await prisma.newsEdition.update({
    where: { id: uuidSchema.parse(id) },
    data,
  });
}

export async function tryClaimEditionBuild(fingerprint: string, periodKey: string) {
  const existing = await findEditionByFingerprintAndPeriod(fingerprint, periodKey);
  if (existing) {
    return existing;
  }
  return null;
}

/** Editions created before `cutoff`, with their story ids (for the retention cleanup). */
export async function listEditionsCreatedBefore(cutoff: Date) {
  return await prisma.newsEdition.findMany({
    where: { createdAt: { lt: cutoff }, newsRequest: { isEdition: true } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      newsRequestId: true,
      newsRequest: { select: { stories: { select: { id: true } } } },
    },
  });
}

const ACTIVITY_LOOKUP_CHUNK = 1_000;

/**
 * Story ids (from `storyIds`) that any user has saved/bookmarked, voted on, or
 * linked to a chat. Saved stories live in `User.savedStories` (no FK), so they
 * are checked explicitly.
 */
export async function findStoryIdsWithUserActivity(
  storyIds: string[],
): Promise<Set<string>> {
  const active = new Set<string>();
  for (let start = 0; start < storyIds.length; start += ACTIVITY_LOOKUP_CHUNK) {
    const chunk = storyIds.slice(start, start + ACTIVITY_LOOKUP_CHUNK);
    const inChunk = new Set(chunk);
    const [votes, chatSessions, chatMessages, savers] = await Promise.all([
      prisma.newsStoryVote.findMany({
        where: { newsStoryId: { in: chunk } },
        select: { newsStoryId: true },
        distinct: ["newsStoryId"],
      }),
      prisma.chatSession.findMany({
        where: { newsStoryId: { in: chunk } },
        select: { newsStoryId: true },
        distinct: ["newsStoryId"],
      }),
      prisma.chatMessage.findMany({
        where: { newsStoryId: { in: chunk } },
        select: { newsStoryId: true },
        distinct: ["newsStoryId"],
      }),
      prisma.user.findMany({
        where: { savedStories: { hasSome: chunk } },
        select: { savedStories: true },
      }),
    ]);
    for (const row of [...votes, ...chatSessions, ...chatMessages]) {
      if (row.newsStoryId) active.add(row.newsStoryId);
    }
    for (const user of savers) {
      for (const id of user.savedStories) {
        if (inChunk.has(id)) active.add(id);
      }
    }
  }
  return active;
}

/**
 * Deletes edition news requests; editions, stories and their sources cascade,
 * and delivery `editionId`s are set to null. Never touches non-edition requests.
 */
export async function deleteEditionNewsRequests(newsRequestIds: string[]) {
  if (newsRequestIds.length === 0) {
    return 0;
  }
  const result = await prisma.newsRequest.deleteMany({
    where: { id: { in: newsRequestIds }, isEdition: true },
  });
  return result.count;
}
