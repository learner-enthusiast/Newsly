import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatRecentMessagesForEnhancer } from "./queryEnhancerAgent";

describe("formatRecentMessagesForEnhancer", () => {
  it("returns undefined when no messages", () => {
    assert.equal(formatRecentMessagesForEnhancer(undefined), undefined);
    assert.equal(formatRecentMessagesForEnhancer([]), undefined);
  });

  it("keeps at most 10 messages and trims content", () => {
    const messages = Array.from({ length: 12 }, (_, index) => ({
      role: "user",
      content: `message-${index}`,
    }));
    const formatted = formatRecentMessagesForEnhancer(messages);
    assert.ok(formatted);
    assert.equal(formatted.length, 10);
    assert.equal(formatted[0]?.content, "message-2");
    assert.equal(formatted[9]?.content, "message-11");
  });
});
