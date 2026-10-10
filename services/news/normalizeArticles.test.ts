import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  articlePublishedMatchesRequestDate,
  excludeTradingRecommendationArticles,
  filterArticlesNearRequestDate,
  filterArticlesInRequestWindow,
  dedupeNearDuplicateTitles,
  interleaveSerpPayloads,
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

describe("filterArticlesInRequestWindow", () => {
  it("keeps the request day and the previous day, drops older and later", () => {
    const rows = filterArticlesInRequestWindow(
      [
        link({ url: "https://example.com/today", publishedAt: "2025-09-22T03:00:00.000Z" }),
        link({ url: "https://example.com/yday", publishedAt: "2025-09-21T09:00:00.000Z" }),
        link({ url: "https://example.com/old", publishedAt: "2025-09-19T09:00:00.000Z" }),
        link({ url: "https://example.com/next", publishedAt: "2025-09-23T01:00:00.000Z" }),
        link({ url: "https://example.com/undated" }),
      ],
      "2025-09-22",
    );
    assert.deepEqual(
      rows.map((row) => row.url),
      ["https://example.com/today", "https://example.com/yday", "https://example.com/undated"],
    );
  });
});

describe("interleaveSerpPayloads", () => {
  it("round-robins news_results so later queries reach the head", () => {
    const merged = interleaveSerpPayloads([
      { news_results: ["a1", "a2", "a3"] },
      null,
      { news_results: ["b1"], organic_results: ["o1"] },
    ]);
    assert.deepEqual(merged.news_results, ["a1", "b1", "a2", "a3"]);
    assert.deepEqual(merged.organic_results, ["o1"]);
  });
});

describe("isTradingRecommendationArticle body checks", () => {
  it("keeps ordinary market news that mentions target price / intraday / stop-loss", () => {
    assert.equal(
      isTradingRecommendationArticle({
        title: "Infosys shares rise after Q2 beat",
        scrapedContent:
          "Brokerages raised their target price after results. The stock hit an intraday high of 1,820 before profit-taking; traders cited stop-loss triggers.",
      }),
      false,
    );
  });

  it("still drops tip pages by body text", () => {
    assert.equal(
      isTradingRecommendationArticle({
        title: "Market outlook",
        scrapedContent: "Here are three stocks to buy today with intraday calls from our analyst.",
      }),
      true,
    );
  });

  it("still drops tip pages by title", () => {
    assert.equal(
      isTradingRecommendationArticle({ title: "Buy HDFC Bank, target price 1,900, stop-loss 1,650" }),
      true,
    );
  });
});

describe("dedupeNearDuplicateTitles", () => {
  it("drops syndicated copies with near-identical titles", () => {
    const rows = dedupeNearDuplicateTitles([
      { title: "RBI keeps repo rate unchanged at 6.5% in October policy" },
      { title: "RBI keeps repo rate unchanged at 6.5% in October policy review" },
      { title: "Sensex closes 400 points higher led by banks" },
    ]);
    assert.equal(rows.length, 2);
  });
});
