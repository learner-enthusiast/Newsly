import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeDeterminerEvidence } from "@/Agents/chat/smallDeterminerAgent";
import { buildResearchPromptWithHistory } from "@/services/chat/researchPrompt";
import { pickChatYoutubeVideoIds } from "@/services/chat/chatYoutubeEvidence";

describe("normalizeDeterminerEvidence", () => {
  it("defaults optional evidence to false", () => {
    assert.deepEqual(normalizeDeterminerEvidence(null), {
      useYoutube: false,
      useAiOverviewFollowUp: false,
    });
    assert.deepEqual(normalizeDeterminerEvidence(undefined), {
      useYoutube: false,
      useAiOverviewFollowUp: false,
    });
  });

  it("honors explicit true flags", () => {
    assert.deepEqual(
      normalizeDeterminerEvidence({
        useYoutube: true,
        useAiOverviewFollowUp: true,
      }),
      { useYoutube: true, useAiOverviewFollowUp: true },
    );
  });
});

describe("buildResearchPromptWithHistory", () => {
  it("includes recent turns for contextual research", () => {
    const prompt = buildResearchPromptWithHistory("Who buys the most?", [
      { role: "user", content: "Tell me about India's diesel exports." },
      { role: "agent", content: "India exports diesel to several regions…" },
    ]);
    assert.match(prompt, /India's diesel exports/);
    assert.match(prompt, /Who buys the most/);
  });
});

describe("pickChatYoutubeVideoIds", () => {
  it("selects up to three distinct video ids", () => {
    const picked = pickChatYoutubeVideoIds(
      {
        video_results: [
          { video_id: "a", title: "First" },
          { video_id: "b", title: "Second" },
          { video_id: "a", title: "Dup" },
          { video_id: "c", title: "Third" },
          { video_id: "d", title: "Fourth" },
        ],
      },
      3,
    );
    assert.deepEqual(
      picked.map((row) => row.videoId),
      ["a", "b", "c"],
    );
  });
});
