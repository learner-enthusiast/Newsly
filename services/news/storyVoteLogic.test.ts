import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCounterDelta,
  buildNewsStoryVoteSummary,
  resolveVoteCounterDelta,
  resolveVoteMutation,
  type VoteType,
  voteTypeSchema,
} from "./storyVoteLogic";

describe("resolveVoteMutation", () => {
  it("covers create, toggle remove, and flip transitions", () => {
    assert.deepEqual(resolveVoteMutation(null, "UP"), {
      action: "create",
      vote: "UP",
    });
    assert.deepEqual(resolveVoteMutation(null, "DOWN"), {
      action: "create",
      vote: "DOWN",
    });
    assert.deepEqual(resolveVoteMutation("UP", "UP"), { action: "delete" });
    assert.deepEqual(resolveVoteMutation("DOWN", "DOWN"), { action: "delete" });
    assert.deepEqual(resolveVoteMutation("UP", "DOWN"), {
      action: "update",
      vote: "DOWN",
    });
    assert.deepEqual(resolveVoteMutation("DOWN", "UP"), {
      action: "update",
      vote: "UP",
    });
  });
});

describe("resolveVoteCounterDelta", () => {
  it("increments upvotes on first UP", () => {
    assert.deepEqual(resolveVoteCounterDelta(null, "UP"), {
      upvotesDelta: 1,
      downvotesDelta: 0,
    });
  });

  it("increments downvotes on first DOWN", () => {
    assert.deepEqual(resolveVoteCounterDelta(null, "DOWN"), {
      upvotesDelta: 0,
      downvotesDelta: 1,
    });
  });

  it("decrements upvotes when removing UP", () => {
    assert.deepEqual(resolveVoteCounterDelta("UP", "UP"), {
      upvotesDelta: -1,
      downvotesDelta: 0,
    });
  });

  it("decrements downvotes when removing DOWN", () => {
    assert.deepEqual(resolveVoteCounterDelta("DOWN", "DOWN"), {
      upvotesDelta: 0,
      downvotesDelta: -1,
    });
  });

  it("moves one vote from UP to DOWN", () => {
    assert.deepEqual(resolveVoteCounterDelta("UP", "DOWN"), {
      upvotesDelta: -1,
      downvotesDelta: 1,
    });
  });

  it("moves one vote from DOWN to UP", () => {
    assert.deepEqual(resolveVoteCounterDelta("DOWN", "UP"), {
      upvotesDelta: 1,
      downvotesDelta: -1,
    });
  });
});

describe("applyCounterDelta", () => {
  it("rejects negative counters", () => {
    assert.throws(
      () =>
        applyCounterDelta({ upvotes: 0, downvotes: 0 }, { upvotesDelta: -1, downvotesDelta: 0 }),
      /negative/,
    );
    assert.throws(
      () =>
        applyCounterDelta({ upvotes: 0, downvotes: 0 }, { upvotesDelta: 0, downvotesDelta: -1 }),
      /negative/,
    );
  });

  it("simulates two users voting UP then one removing", () => {
    let counters = { upvotes: 0, downvotes: 0 };
    counters = applyCounterDelta(counters, resolveVoteCounterDelta(null, "UP"));
    counters = applyCounterDelta(counters, resolveVoteCounterDelta(null, "UP"));
    assert.equal(counters.upvotes, 2);
    counters = applyCounterDelta(counters, resolveVoteCounterDelta("UP", "UP"));
    assert.equal(counters.upvotes, 1);
    assert.equal(counters.downvotes, 0);
  });

  it("simulates UP then flip to DOWN", () => {
    let counters = { upvotes: 0, downvotes: 0 };
    counters = applyCounterDelta(counters, resolveVoteCounterDelta(null, "UP"));
    counters = applyCounterDelta(counters, resolveVoteCounterDelta("UP", "DOWN"));
    assert.deepEqual(counters, { upvotes: 0, downvotes: 1 });
  });
});

describe("buildNewsStoryVoteSummary", () => {
  it("computes netVotes from denormalized counters", () => {
    const summary = buildNewsStoryVoteSummary({
      upvotes: 10,
      downvotes: 3,
      userVote: "UP",
    });
    assert.equal(summary.netVotes, 7);
    assert.equal(summary.userVote, "UP");
  });
});

describe("voteTypeSchema", () => {
  it("rejects invalid vote types", () => {
    assert.equal(voteTypeSchema.safeParse("UP").success, true);
    assert.equal(voteTypeSchema.safeParse("DOWN").success, true);
    assert.equal(voteTypeSchema.safeParse("SIDE").success, false);
  });
});

describe("counter invariants (simulated)", () => {
  it("keeps tallies aligned with per-user vote records", () => {
    const userVotes = new Map<string, VoteType>();
    let counters = { upvotes: 0, downvotes: 0 };

    const cast = (userId: string, desired: VoteType) => {
      const existing = userVotes.get(userId) ?? null;
      const delta = resolveVoteCounterDelta(existing, desired);
      counters = applyCounterDelta(counters, delta);
      const mutation = resolveVoteMutation(existing, desired);
      if (mutation.action === "create") {
        userVotes.set(userId, mutation.vote);
      } else if (mutation.action === "delete") {
        userVotes.delete(userId);
      } else {
        userVotes.set(userId, mutation.vote);
      }
    };

    cast("u1", "UP");
    cast("u2", "DOWN");
    cast("u1", "DOWN");

    const upCount = [...userVotes.values()].filter((vote) => vote === "UP").length;
    const downCount = [...userVotes.values()].filter((vote) => vote === "DOWN").length;
    assert.equal(counters.upvotes, upCount);
    assert.equal(counters.downvotes, downCount);
    assert.equal(counters.upvotes, 0);
    assert.equal(counters.downvotes, 2);
  });
});
