import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dedupeNewStoryTopics,
  formatMessagesForPotentialStoryTopicAgent,
  normalizeStoryTopicKey,
  storyTopicsOverlap,
} from "./chatStoryIdentifierAgent";

describe("formatMessagesForPotentialStoryTopicAgent", () => {
  it("returns empty array when no messages", () => {
    assert.deepEqual(formatMessagesForPotentialStoryTopicAgent([]), []);
  });

  it("keeps at most 10 recent messages", () => {
    const messages = Array.from({ length: 12 }, (_, index) => ({
      role: "user",
      content: `msg-${index}`,
    }));
    const formatted = formatMessagesForPotentialStoryTopicAgent(messages);
    assert.equal(formatted.length, 10);
    assert.equal(formatted[0]?.content, "msg-2");
  });
});

describe("dedupeNewStoryTopics", () => {
  it("removes topics that overlap existing list", () => {
    const existing = ["Microsoft AI data centers in Hyderabad"];
    const candidates = [
      "Microsoft AI data center expansion in Hyderabad",
      "India diesel export policy changes",
    ];
    const result = dedupeNewStoryTopics(candidates, existing);
    assert.deepEqual(result, ["India diesel export policy changes"]);
  });

  it("caps at five unique topics", () => {
    const result = dedupeNewStoryTopics(
      [
        "Solar tariff reforms in Gujarat",
        "Coal mine auctions in Odisha",
        "UPI limits for merchant payments",
        "Semiconductor packaging in Karnataka",
        "Airport privatization in Kerala",
        "Monsoon crop insurance payouts",
      ],
      [],
    );
    assert.equal(result.length, 5);
  });
});

describe("storyTopicsOverlap", () => {
  it("normalizes punctuation for comparison", () => {
    const a = "Reliance Jio — 5G rollout in rural India";
    const b = "reliance jio 5g rollout in rural india";
    assert.equal(normalizeStoryTopicKey(a), normalizeStoryTopicKey(b));
    assert.equal(storyTopicsOverlap(a, b), true);
  });
});
