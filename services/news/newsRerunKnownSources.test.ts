import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildKnownSourceIndex,
  isKnownArticleUrl,
  partitionNewNormalizedArticles,
} from "@/services/news/newsRerunKnownSources";
import { shouldRunNewsRerunPipeline } from "@/services/news/newsRerunGuard";

describe("shouldRunNewsRerunPipeline", () => {
  it("returns false when isRerunning is false", () => {
    assert.equal(shouldRunNewsRerunPipeline(false), false);
  });

  it("returns true when isRerunning is true", () => {
    assert.equal(shouldRunNewsRerunPipeline(true), true);
  });
});

describe("partitionNewNormalizedArticles", () => {
  it("skips duplicate URLs", () => {
    const known = buildKnownSourceIndex([
      {
        url: "https://example.com/a",
        sourceType: "google_news",
      },
    ]);
    const { newArticles, skippedKnown } = partitionNewNormalizedArticles(
      [
        { url: "https://example.com/a", title: "A" },
        { url: "https://other.com/b", title: "B" },
      ],
      known,
    );
    assert.equal(skippedKnown, 1);
    assert.equal(newArticles.length, 1);
    assert.equal(newArticles[0]?.url, "https://other.com/b");
  });
});

describe("isKnownArticleUrl", () => {
  it("matches the same canonical URL key", () => {
    const known = buildKnownSourceIndex([
      { url: "https://example.com/a", sourceType: "google_search" },
    ]);
    assert.equal(isKnownArticleUrl("https://example.com/a", known), true);
  });
});
