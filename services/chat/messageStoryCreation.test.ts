import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  augmentDeterminerForStoryHandoff,
  resolveShouldCreateStoryFromEvent,
} from "./messageStoryCreation";

describe("resolveShouldCreateStoryFromEvent", () => {
  it("follows explicit client flag only", () => {
    assert.equal(resolveShouldCreateStoryFromEvent(true, false), true);
    assert.equal(resolveShouldCreateStoryFromEvent(true, true), true);
    assert.equal(resolveShouldCreateStoryFromEvent("true", false), true);
    assert.equal(resolveShouldCreateStoryFromEvent(false, false), false);
    assert.equal(resolveShouldCreateStoryFromEvent(undefined, false), false);
  });
});

describe("augmentDeterminerForStoryHandoff", () => {
  const baseDeterminer = {
    useTools: "no" as const,
    useExistingResearch: false,
    existingResearchQuery: null,
    firecrawlUrls: [] as string[],
    evidence: { useYoutube: false, useAiOverviewFollowUp: false },
    model: "test",
  };

  it("sets vector query from Create a story about prefix", () => {
    const next = augmentDeterminerForStoryHandoff(
      baseDeterminer,
      3,
      "Create a story about: India-US trade pact stakeholders",
    );
    assert.equal(next.useExistingResearch, true);
    assert.match(next.existingResearchQuery ?? "", /India-US trade pact/i);
  });
});
