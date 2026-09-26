import { z } from "zod";

export const voteTypeSchema = z.enum(["UP", "DOWN"]);

export type VoteType = z.infer<typeof voteTypeSchema>;

export const newsStoryVoteSummarySchema = z.object({
  upvotes: z.number().int().min(0),
  downvotes: z.number().int().min(0),
  netVotes: z.number().int(),
  userVote: voteTypeSchema.nullable(),
});

export type NewsStoryVoteSummary = z.infer<typeof newsStoryVoteSummarySchema>;

export type VoteMutation =
  | { action: "create"; vote: VoteType }
  | { action: "delete" }
  | { action: "update"; vote: VoteType };

export type VoteCounterDelta = {
  upvotesDelta: number;
  downvotesDelta: number;
};

/** Maps desired vote + existing row to create, flip, or remove (toggle). */
export function resolveVoteMutation(
  existingVote: VoteType | null,
  desiredVote: VoteType,
): VoteMutation {
  if (existingVote === null) {
    return { action: "create", vote: desiredVote };
  }
  if (existingVote === desiredVote) {
    return { action: "delete" };
  }
  return { action: "update", vote: desiredVote };
}

/** Denormalized counter adjustments for a vote transition (must stay in sync with NewsStoryVote). */
export function resolveVoteCounterDelta(
  existingVote: VoteType | null,
  desiredVote: VoteType,
): VoteCounterDelta {
  const mutation = resolveVoteMutation(existingVote, desiredVote);

  if (mutation.action === "create") {
    return mutation.vote === "UP"
      ? { upvotesDelta: 1, downvotesDelta: 0 }
      : { upvotesDelta: 0, downvotesDelta: 1 };
  }

  if (mutation.action === "delete") {
    if (existingVote === "UP") {
      return { upvotesDelta: -1, downvotesDelta: 0 };
    }
    if (existingVote === "DOWN") {
      return { upvotesDelta: 0, downvotesDelta: -1 };
    }
    return { upvotesDelta: 0, downvotesDelta: 0 };
  }

  if (existingVote === "UP" && mutation.vote === "DOWN") {
    return { upvotesDelta: -1, downvotesDelta: 1 };
  }
  if (existingVote === "DOWN" && mutation.vote === "UP") {
    return { upvotesDelta: 1, downvotesDelta: -1 };
  }

  return { upvotesDelta: 0, downvotesDelta: 0 };
}

export function applyCounterDelta(
  current: { upvotes: number; downvotes: number },
  delta: VoteCounterDelta,
): { upvotes: number; downvotes: number } {
  const upvotes = current.upvotes + delta.upvotesDelta;
  const downvotes = current.downvotes + delta.downvotesDelta;
  if (upvotes < 0 || downvotes < 0) {
    throw new Error("Vote counters would become negative");
  }
  return { upvotes, downvotes };
}

export function buildNewsStoryVoteSummary(input: {
  upvotes: number;
  downvotes: number;
  userVote: VoteType | null;
}): NewsStoryVoteSummary {
  return newsStoryVoteSummarySchema.parse({
    upvotes: input.upvotes,
    downvotes: input.downvotes,
    netVotes: input.upvotes - input.downvotes,
    userVote: input.userVote,
  });
}
