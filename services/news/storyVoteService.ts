import {
  applyNewsStoryVote,
  getNewsStoryVoteSummary,
  removeNewsStoryVote,
} from "@/repositories/newsStoryVote";
import {
  buildNewsStoryVoteSummary,
  type NewsStoryVoteSummary,
  type VoteType,
  voteTypeSchema,
} from "@/services/news/storyVoteLogic";
import { z } from "zod";

export const newsStoryVoteBodySchema = z.object({
  vote: voteTypeSchema,
});

export type NewsStoryVoteBody = z.infer<typeof newsStoryVoteBodySchema>;

const storyIdParamSchema = z.uuid("storyId must be a uuid");

export async function getStoryVoteState(
  userId: string,
  storyId: string,
): Promise<NewsStoryVoteSummary | null> {
  return getNewsStoryVoteSummary(storyIdParamSchema.parse(storyId), userId);
}

export async function castStoryVote(
  userId: string,
  storyId: string,
  body: NewsStoryVoteBody,
): Promise<NewsStoryVoteSummary | null> {
  const parsed = newsStoryVoteBodySchema.parse(body);
  return applyNewsStoryVote(
    storyIdParamSchema.parse(storyId),
    userId,
    parsed.vote,
  );
}

export async function clearStoryVote(
  userId: string,
  storyId: string,
): Promise<NewsStoryVoteSummary | null> {
  return removeNewsStoryVote(storyIdParamSchema.parse(storyId), userId);
}

export function attachVoteFieldsToStory<
  T extends { id: string; upvotes: number; downvotes: number },
>(story: T, userVote: VoteType | null) {
  return {
    ...story,
    netVotes: story.upvotes - story.downvotes,
    userVote,
  };
}

export function storyVoteSummaryFromStoryRow(
  story: { upvotes: number; downvotes: number },
  userVote: VoteType | null,
): NewsStoryVoteSummary {
  return buildNewsStoryVoteSummary({
    upvotes: story.upvotes,
    downvotes: story.downvotes,
    userVote,
  });
}
