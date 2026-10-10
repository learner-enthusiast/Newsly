import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterArticlesPublishedOnOrAfterBoundary } from "@/services/news/normalizeArticles";

describe("filterArticlesPublishedOnOrAfterBoundary", () => {
  it("keeps undated articles and drops older dated rows", () => {
    const boundary = new Date("2026-06-01T12:00:00.000Z");
    const filtered = filterArticlesPublishedOnOrAfterBoundary(
      [
        {
          url: "https://a.test/1",
          sourceType: "google_news",
          index: 0,
          publishedAt: "2026-05-01T00:00:00.000Z",
        },
        {
          url: "https://a.test/2",
          sourceType: "google_news",
          index: 1,
          publishedAt: "2026-06-02T00:00:00.000Z",
        },
        {
          url: "https://a.test/3",
          sourceType: "google_news",
          index: 2,
        },
      ],
      boundary,
    );
    assert.deepEqual(
      filtered.map((row) => row.url),
      ["https://a.test/2", "https://a.test/3"],
    );
  });
});
