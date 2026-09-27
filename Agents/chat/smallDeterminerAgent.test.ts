import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyStoryCreationIntentGate,
  buildSmallDeterminerResultFromModelOutput,
  normalizeStoryCreationFields,
  sanitizeSerpToolInput,
  type SmallDeterminerModelOutput,
} from "./smallDeterminerAgent";

function baseModelOutput(
  overrides: Partial<SmallDeterminerModelOutput>,
): SmallDeterminerModelOutput {
  return {
    useTools: "no",
    useExistingResearch: false,
    existingResearchQuery: null,
    reasoning: null,
    calls: null,
    firecrawlUrls: null,
    evidence: null,
    shouldCreateStory: false,
    storyCreationReason: null,
    ...overrides,
  };
}

const googleNewsCall = {
  tool: "searchGoogleNews" as const,
  input: {
    q: "Microsoft AI data center Hyderabad",
    num: 10,
    gl: null,
    hl: null,
    location: null,
    google_domain: null,
    device: null,
    topic_token: null,
    publication_token: null,
    section_token: null,
    story_token: null,
    kgmid: null,
    no_cache: null,
  },
};

describe("normalizeStoryCreationFields", () => {
  it("passes through shouldCreateStory and trims reason", () => {
    assert.deepEqual(
      normalizeStoryCreationFields({
        shouldCreateStory: true,
        storyCreationReason: "  User explicitly requested a news story.  ",
      }),
      {
        shouldCreateStory: true,
        storyCreationReason: "User explicitly requested a news story.",
      },
    );
  });

  it("defaults false and omits empty reason", () => {
    assert.deepEqual(
      normalizeStoryCreationFields({
        shouldCreateStory: false,
        storyCreationReason: "   ",
      }),
      { shouldCreateStory: false },
    );
  });
});

describe("applyStoryCreationIntentGate", () => {
  it("forces story fields off when fromOriginalChat is false", () => {
    assert.deepEqual(
      applyStoryCreationIntentGate(
        false,
        normalizeStoryCreationFields({
          shouldCreateStory: true,
          storyCreationReason: "User explicitly requested a news story.",
        }),
      ),
      { shouldCreateStory: false },
    );
  });
});

describe("shouldCreateStory intent (model output pass-through)", () => {
  it("1. explicit story creation with fresh research", () => {
    const result = buildSmallDeterminerResultFromModelOutput(
      baseModelOutput({
        useTools: "yes",
        shouldCreateStory: true,
        storyCreationReason: "User explicitly requested a news story.",
        calls: [googleNewsCall],
      }),
      { fromOriginalChat: true },
    );
    assert.equal(result.shouldCreateStory, true);
    assert.equal(result.useTools, "yes");
    assert.ok(result.useTools === "yes" && result.calls.length > 0);
  });

  it("2. research only — not story creation", () => {
    const result = buildSmallDeterminerResultFromModelOutput(
      baseModelOutput({
        useTools: "yes",
        shouldCreateStory: false,
        storyCreationReason: "User requested research, not story creation.",
        calls: [googleNewsCall],
      }),
      { fromOriginalChat: true },
    );
    assert.equal(result.shouldCreateStory, false);
    assert.equal(result.useTools, "yes");
  });

  it("3. summary only — not story creation", () => {
    const result = buildSmallDeterminerResultFromModelOutput(
      baseModelOutput({
        useTools: "no",
        shouldCreateStory: false,
        storyCreationReason: "User requested research, not story creation.",
      }),
      { fromOriginalChat: true },
    );
    assert.equal(result.shouldCreateStory, false);
    assert.equal(result.useTools, "no");
  });

  it("4. explicit conversion to news story", () => {
    const result = buildSmallDeterminerResultFromModelOutput(
      baseModelOutput({
        useTools: "no",
        shouldCreateStory: true,
        storyCreationReason:
          "User asked to turn the current research into a story.",
      }),
      { fromOriginalChat: true },
    );
    assert.equal(result.shouldCreateStory, true);
  });

  it("5. contextual story creation reference", () => {
    const result = buildSmallDeterminerResultFromModelOutput(
      baseModelOutput({
        useTools: "no",
        shouldCreateStory: true,
        storyCreationReason:
          "User used an ambiguous story-creation request but recent context clearly identifies the subject.",
      }),
      { fromOriginalChat: true },
    );
    assert.equal(result.shouldCreateStory, true);
  });

  it("6. ambiguous follow-up — not story creation", () => {
    const result = buildSmallDeterminerResultFromModelOutput(
      baseModelOutput({
        useTools: "yes",
        shouldCreateStory: false,
        storyCreationReason: "User requested research, not story creation.",
        calls: [googleNewsCall],
      }),
      { fromOriginalChat: true },
    );
    assert.equal(result.shouldCreateStory, false);
  });

  it("7. story from existing research without forcing Serp", () => {
    const result = buildSmallDeterminerResultFromModelOutput(
      baseModelOutput({
        useTools: "no",
        useExistingResearch: true,
        existingResearchQuery:
          "Microsoft AI data center investment Hyderabad collected research",
        shouldCreateStory: true,
        storyCreationReason:
          "User asked to turn the current research into a story.",
      }),
      { researchSourceCount: 5, fromOriginalChat: true },
    );
    assert.equal(result.shouldCreateStory, true);
    assert.equal(result.useTools, "no");
    assert.equal(result.useExistingResearch, true);
    assert.ok(result.existingResearchQuery?.includes("Microsoft"));
  });

  it("model story intent ignored when fromOriginalChat is false", () => {
    const result = buildSmallDeterminerResultFromModelOutput(
      baseModelOutput({
        shouldCreateStory: true,
        storyCreationReason: "User explicitly requested a news story.",
      }),
    );
    assert.equal(result.shouldCreateStory, false);
    assert.equal(result.storyCreationReason, undefined);
  });
});

describe("existing determiner behavior regression", () => {
  it("8. validates Serp calls and firecrawl-only useTools no", () => {
    const firecrawlOnly = buildSmallDeterminerResultFromModelOutput(
      baseModelOutput({
        useTools: "no",
        firecrawlUrls: ["https://example.com/article"],
        shouldCreateStory: false,
      }),
    );
    assert.equal(firecrawlOnly.useTools, "no");
    assert.deepEqual(firecrawlOnly.firecrawlUrls, [
      "https://example.com/article",
    ]);

    const sanitized = sanitizeSerpToolInput("searchGoogleNewsTab", {
      q: " test ",
      tbm: "nws",
    });
    assert.equal(sanitized.q, "test");
    assert.equal("tbm" in sanitized, false);
  });

  it("8b. preserves evidence flags", () => {
    const result = buildSmallDeterminerResultFromModelOutput(
      baseModelOutput({
        useTools: "yes",
        calls: [googleNewsCall],
        evidence: { useYoutube: true, useAiOverviewFollowUp: false },
        shouldCreateStory: false,
      }),
    );
    assert.deepEqual(result.evidence, {
      useYoutube: true,
      useAiOverviewFollowUp: false,
    });
  });

  it("8c. disables existing research on news-story sessions", () => {
    const result = buildSmallDeterminerResultFromModelOutput(
      baseModelOutput({
        useTools: "no",
        useExistingResearch: true,
        existingResearchQuery: "should be stripped",
        shouldCreateStory: true,
      }),
      { isNewsStory: true, researchSourceCount: 10 },
    );
    assert.equal(result.useExistingResearch, false);
    assert.equal(result.existingResearchQuery, null);
  });
});
