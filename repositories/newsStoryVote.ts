import { z } from "zod";
import { prisma } from "@/db";
import type { Prisma } from "@/db/generated/client";
import type { VoteType } from "@/services/news/storyVoteLogic";
import {
  applyCounterDelta,
  buildNewsStoryVoteSummary,
  resolveVoteCounterDelta,
  resolveVoteMutation,
  type NewsStoryVoteSummary,
  voteTypeSchema,
} from "@/services/news/storyVoteLogic";

const newsStoryIdSchema = z.uuid("newsStoryId must be a uuid");
const userIdSchema = z.string().min(1, "userId is required");

type VoteDbClient = Pick<
  typeof prisma,
  "newsStory" | "newsStoryVote" | "user"
>;

async function readStoryCounters(
  newsStoryId: string,
  client: VoteDbClient,
): Promise<{ upvotes: number; downvotes: number } | null> {
  const row = await client.newsStory.findUnique({
    where: { id: newsStoryIdSchema.parse(newsStoryId) },
    select: { upvotes: true, downvotes: true },
  });
  return row ?? null;
}

export async function getUserVoteForStory(
  newsStoryId: string,
  userId: string,
  client: Pick<typeof prisma, "newsStoryVote"> = prisma,
): Promise<VoteType | null> {
  const row = await client.newsStoryVote.findUnique({
    where: {
      newsStoryId_userId: {
        newsStoryId: newsStoryIdSchema.parse(newsStoryId),
        userId: userIdSchema.parse(userId),
      },
    },
    select: { vote: true },
  });
  if (!row) {
    return null;
  }
  return voteTypeSchema.parse(row.vote);
}

export async function getUserVotesForStories(
  userId: string,
  newsStoryIds: string[],
): Promise<Map<string, VoteType>> {
  if (newsStoryIds.length === 0) {
    return new Map();
  }
  const parsedUserId = userIdSchema.parse(userId);
  const parsedIds = z.array(newsStoryIdSchema).parse(newsStoryIds);
  const rows = await prisma.newsStoryVote.findMany({
    where: {
      userId: parsedUserId,
      newsStoryId: { in: parsedIds },
    },
    select: { newsStoryId: true, vote: true },
  });

  const map = new Map<string, VoteType>();
  for (const row of rows) {
    map.set(row.newsStoryId, voteTypeSchema.parse(row.vote));
  }
  return map;
}

export async function getNewsStoryVoteSummary(
  newsStoryId: string,
  userId: string,
): Promise<NewsStoryVoteSummary | null> {
  const parsedStoryId = newsStoryIdSchema.parse(newsStoryId);
  const [counters, userVote] = await Promise.all([
    readStoryCounters(parsedStoryId, prisma),
    getUserVoteForStory(parsedStoryId, userId),
  ]);
  if (!counters) {
    return null;
  }

  return buildNewsStoryVoteSummary({
    upvotes: counters.upvotes,
    downvotes: counters.downvotes,
    userVote,
  });
}

async function applyVoteMutationInTransaction(
  tx: Prisma.TransactionClient,
  params: {
    newsStoryId: string;
    userId: string;
    desiredVote: VoteType;
  },
): Promise<NewsStoryVoteSummary | null> {
  const parsedStoryId = newsStoryIdSchema.parse(params.newsStoryId);
  const parsedUserId = userIdSchema.parse(params.userId);

  const story = await tx.newsStory.findUnique({
    where: { id: parsedStoryId },
    select: { id: true, upvotes: true, downvotes: true },
  });
  if (!story) {
    return null;
  }

  const user = await tx.user.findUnique({
    where: { id: parsedUserId },
    select: { id: true },
  });
  if (!user) {
    return null;
  }

  const existing = await tx.newsStoryVote.findUnique({
    where: {
      newsStoryId_userId: {
        newsStoryId: parsedStoryId,
        userId: parsedUserId,
      },
    },
  });

  const existingVote = existing
    ? voteTypeSchema.parse(existing.vote)
    : null;
  const mutation = resolveVoteMutation(existingVote, params.desiredVote);
  const delta = resolveVoteCounterDelta(existingVote, params.desiredVote);
  const nextCounters = applyCounterDelta(
    { upvotes: story.upvotes, downvotes: story.downvotes },
    delta,
  );

  if (mutation.action === "create") {
    await tx.newsStoryVote.create({
      data: {
        newsStoryId: parsedStoryId,
        userId: parsedUserId,
        vote: mutation.vote,
      },
    });
  } else if (mutation.action === "delete") {
    await tx.newsStoryVote.delete({
      where: { id: existing!.id },
    });
  } else {
    await tx.newsStoryVote.update({
      where: { id: existing!.id },
      data: { vote: mutation.vote },
    });
  }

  const updatedStory = await tx.newsStory.update({
    where: { id: parsedStoryId },
    data: {
      upvotes: nextCounters.upvotes,
      downvotes: nextCounters.downvotes,
    },
    select: { upvotes: true, downvotes: true },
  });

  const userVote = await getUserVoteForStory(parsedStoryId, parsedUserId, tx);

  return buildNewsStoryVoteSummary({
    upvotes: updatedStory.upvotes,
    downvotes: updatedStory.downvotes,
    userVote,
  });
}

export async function applyNewsStoryVote(
  newsStoryId: string,
  userId: string,
  desiredVote: VoteType,
): Promise<NewsStoryVoteSummary | null> {
  voteTypeSchema.parse(desiredVote);
  return prisma.$transaction((tx) =>
    applyVoteMutationInTransaction(tx, {
      newsStoryId,
      userId,
      desiredVote,
    }),
  );
}

export async function removeNewsStoryVote(
  newsStoryId: string,
  userId: string,
): Promise<NewsStoryVoteSummary | null> {
  const parsedStoryId = newsStoryIdSchema.parse(newsStoryId);
  const parsedUserId = userIdSchema.parse(userId);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.newsStoryVote.findUnique({
      where: {
        newsStoryId_userId: {
          newsStoryId: parsedStoryId,
          userId: parsedUserId,
        },
      },
    });
    if (!existing) {
      return getNewsStoryVoteSummary(parsedStoryId, parsedUserId);
    }

    const existingVote = voteTypeSchema.parse(existing.vote);
    const delta = resolveVoteCounterDelta(existingVote, existingVote);
    const story = await tx.newsStory.findUnique({
      where: { id: parsedStoryId },
      select: { upvotes: true, downvotes: true },
    });
    if (!story) {
      return null;
    }

    const nextCounters = applyCounterDelta(
      { upvotes: story.upvotes, downvotes: story.downvotes },
      delta,
    );

    await tx.newsStoryVote.delete({ where: { id: existing.id } });
    const updatedStory = await tx.newsStory.update({
      where: { id: parsedStoryId },
      data: {
        upvotes: nextCounters.upvotes,
        downvotes: nextCounters.downvotes,
      },
      select: { upvotes: true, downvotes: true },
    });

    return buildNewsStoryVoteSummary({
      upvotes: updatedStory.upvotes,
      downvotes: updatedStory.downvotes,
      userVote: null,
    });
  });
}
