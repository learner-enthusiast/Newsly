import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSmallDeterminerResultFromModelOutput,
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

describe("buildSmallDeterminerResultFromModelOutput", () => {
  it("validates Serp calls when useTools is yes", () => {
    const result = buildSmallDeterminerResultFromModelOutput(
      baseModelOutput({
        useTools: "yes",
        calls: [googleNewsCall],
      }),
    );
    assert.equal(result.useTools, "yes");
    assert.ok(result.useTools === "yes" && result.calls.length > 0);
  });

  it("firecrawl-only useTools no", () => {
    const firecrawlOnly = buildSmallDeterminerResultFromModelOutput(
      baseModelOutput({
        useTools: "no",
        firecrawlUrls: ["https://example.com/article"],
      }),
    );
    assert.equal(firecrawlOnly.useTools, "no");
    assert.deepEqual(firecrawlOnly.firecrawlUrls, [
      "https://example.com/article",
    ]);
  });

  it("preserves evidence flags", () => {
    const result = buildSmallDeterminerResultFromModelOutput(
      baseModelOutput({
        useTools: "yes",
        calls: [googleNewsCall],
        evidence: { useYoutube: true, useAiOverviewFollowUp: false },
      }),
    );
    assert.deepEqual(result.evidence, {
      useYoutube: true,
      useAiOverviewFollowUp: false,
    });
  });

  it("disables existing research on news-story sessions", () => {
    const result = buildSmallDeterminerResultFromModelOutput(
      baseModelOutput({
        useTools: "no",
        useExistingResearch: true,
        existingResearchQuery: "should be stripped",
      }),
      { isNewsStory: true, researchSourceCount: 10 },
    );
    assert.equal(result.useExistingResearch, false);
    assert.equal(result.existingResearchQuery, null);
  });

  it("keeps existing research when session has embeddings", () => {
    const result = buildSmallDeterminerResultFromModelOutput(
      baseModelOutput({
        useTools: "no",
        useExistingResearch: true,
        existingResearchQuery: "India US trade pact stakeholders",
      }),
      { researchSourceCount: 5 },
    );
    assert.equal(result.useExistingResearch, true);
    assert.ok(result.existingResearchQuery?.includes("trade"));
  });
});

describe("sanitizeSerpToolInput", () => {
  it("strips tbm and trims q", () => {
    const sanitized = sanitizeSerpToolInput("searchGoogleNewsTab", {
      q: " test ",
      tbm: "nws",
    });
    assert.equal(sanitized.q, "test");
    assert.equal("tbm" in sanitized, false);
  });
});
