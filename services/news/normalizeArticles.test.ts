import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  articlePublishedMatchesRequestDate,
  excludeTradingRecommendationArticles,
  filterArticlesNearRequestDate,
  isTradingRecommendationArticle,
  type NormalizedArticleLink,
} from "./normalizeArticles";

function link(
  overrides: Partial<NormalizedArticleLink> & Pick<NormalizedArticleLink, "url">,
): NormalizedArticleLink {
  return {
    title: "Sample headline",
    sourceType: "google_news",
    index: 0,
    ...overrides,
  };
}

describe("articlePublishedMatchesRequestDate", () => {
  it("accepts same UTC calendar day as request", () => {
    assert.equal(
      articlePublishedMatchesRequestDate(
        "2025-09-22T14:30:00.000Z",
        "2025-09-22",
      ),
      true,
    );
  });

  it("rejects next-day publish for prior request date", () => {
    assert.equal(
      articlePublishedMatchesRequestDate(
        "2025-09-23T08:00:00.000Z",
        "2025-09-22",
      ),
      false,
    );
  });

  it("allows late-evening UTC on previous calendar day", () => {
    assert.equal(
      articlePublishedMatchesRequestDate(
        "2025-09-21T19:00:00.000Z",
        "2025-09-22",
      ),
      true,
    );
  });
});

describe("filterArticlesNearRequestDate", () => {
  it("drops dated articles outside the request day", () => {
    const rows = filterArticlesNearRequestDate(
      [
        link({
          url: "https://example.com/a",
          publishedAt: "2025-09-22T10:00:00.000Z",
        }),
        link({
          url: "https://example.com/b",
          publishedAt: "2025-09-23T10:00:00.000Z",
        }),
        link({ url: "https://example.com/c" }),
      ],
      "2025-09-22",
    );
    assert.equal(rows.length, 2);
    assert.ok(rows.some((row) => row.url.includes("/a")));
    assert.ok(rows.some((row) => row.url.includes("/c")));
  });
});

describe("isTradingRecommendationArticle", () => {
  it("flags market trading guide headlines", () => {
    assert.equal(
      isTradingRecommendationArticle({
        title:
          "Market Trading Guide: Finolex Cables among 3 stock recommendations for 22 September 2025",
      }),
      true,
    );
  });

  it("allows general market news", () => {
    assert.equal(
      isTradingRecommendationArticle({
        title: "Sensex closes higher on RBI policy outlook",
        snippet: "Benchmark indices gained amid banking stocks.",
      }),
      false,
    );
  });
});

describe("excludeTradingRecommendationArticles", () => {
  it("removes trading tip rows from Serp candidates", () => {
    const rows = excludeTradingRecommendationArticles([
      link({
        url: "https://example.com/news",
        title: "India diesel exports rise in September",
      }),
      link({
        url: "https://example.com/tips",
        title: "3 stock picks with target price and stop loss",
      }),
    ]);
    assert.equal(rows.length, 1);
    assert.match(rows[0]!.url, /news$/);
  });
});
