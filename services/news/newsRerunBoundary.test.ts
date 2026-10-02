import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveNewsRerunResearchBoundary } from "@/services/news/newsRerunBoundary";

describe("resolveNewsRerunResearchBoundary", () => {
  it("uses the latest timestamp across request and story metadata", () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const completedAt = new Date("2026-01-02T00:00:00.000Z");
    const storyUpdatedAtMax = new Date("2026-01-03T00:00:00.000Z");
    const boundary = resolveNewsRerunResearchBoundary({
      createdAt,
      completedAt,
      storyUpdatedAtMax,
      sourcePublishedAtMax: null,
    });
    assert.equal(boundary.toISOString(), storyUpdatedAtMax.toISOString());
  });
});
