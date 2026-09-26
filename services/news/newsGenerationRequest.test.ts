import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildNewsSearchPlanPairs,
  normalizeNewsGenerationRequest,
  normalizeSourceDomains,
} from "./newsGenerationRequest";

describe("normalizeNewsGenerationRequest", () => {
  it("applies defaults for legacy-shaped requests", () => {
    const config = normalizeNewsGenerationRequest({
      date: "2026-09-26",
      scope: "world",
    });
    assert.equal(config.storyCount, 5);
    assert.deepEqual(config.categories, []);
    assert.equal(config.language, "English");
    assert.deepEqual(config.sources, []);
    assert.equal(config.location, null);
  });

  it("requires location for both scope", () => {
    assert.throws(() =>
      normalizeNewsGenerationRequest({
        date: "2026-09-26",
        scope: "both",
      }),
    );
  });

  it("normalizes categories and domains", () => {
    const config = normalizeNewsGenerationRequest({
      date: "2026-09-26",
      scope: "local",
      location: " India ",
      categories: [" Markets ", "markets", "Policy"],
      sources: ["https://www.reuters.com", "bloomberg.com"],
      storyCount: 8,
      customQuery: "  RBI policy  ",
    });
    assert.deepEqual(config.categories, ["Markets", "Policy"]);
    assert.deepEqual(config.sources, ["reuters.com", "bloomberg.com"]);
    assert.equal(config.customQuery, "RBI policy");
    assert.equal(config.storyCount, 8);
  });
});

describe("buildNewsSearchPlanPairs", () => {
  it("returns two pairs for both scope", () => {
    const config = normalizeNewsGenerationRequest({
      date: "2026-09-26",
      scope: "both",
      location: "India",
      customQuery: "energy",
    });
    const pairs = buildNewsSearchPlanPairs(config);
    assert.equal(pairs.length, 2);
    assert.match(pairs[0]!.news.query, /India/i);
    assert.match(pairs[1]!.news.query, /world|global/i);
    assert.match(pairs[0]!.news.query, /energy/);
  });
});

describe("normalizeSourceDomains", () => {
  it("deduplicates hostnames", () => {
    assert.deepEqual(
      normalizeSourceDomains(["Reuters.COM", "https://www.reuters.com/path"]),
      ["reuters.com"],
    );
  });
});
