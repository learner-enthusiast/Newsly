import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractOpenGraphImageFromFirecrawl,
  extractSerpRowImageUrl,
  resolveArticleImageUrl,
  resolveNewsStoryImageUrl,
  validateArticleImageUrl,
} from "@/services/news/articleImageUrl";

describe("validateArticleImageUrl", () => {
  it("accepts https image URLs", () => {
    assert.equal(
      validateArticleImageUrl("https://cdn.example.com/photo.jpg"),
      "https://cdn.example.com/photo.jpg",
    );
  });

  it("rejects data URLs and invalid values", () => {
    assert.equal(validateArticleImageUrl("data:image/png;base64,abc"), null);
    assert.equal(validateArticleImageUrl("not-a-url"), null);
    assert.equal(
      validateArticleImageUrl("https://example.com/pixel.gif"),
      null,
    );
  });
});

describe("extractOpenGraphImageFromFirecrawl", () => {
  it("prefers og:image over twitter:image", () => {
    const url = extractOpenGraphImageFromFirecrawl({
      metadata: {
        "og:image": "https://cdn.example.com/og.jpg",
        "twitter:image": "https://cdn.example.com/tw.jpg",
      },
    });
    assert.equal(url, "https://cdn.example.com/og.jpg");
  });

  it("uses twitter:image when og:image is missing", () => {
    const url = extractOpenGraphImageFromFirecrawl({
      metadata: {
        "twitter:image": "https://cdn.example.com/tw.jpg",
      },
    });
    assert.equal(url, "https://cdn.example.com/tw.jpg");
  });
});

describe("resolveArticleImageUrl", () => {
  it("falls back to Serp image when Firecrawl has none", () => {
    assert.equal(
      resolveArticleImageUrl({
        firecrawlPayload: { metadata: {} },
        serpImageUrl: "https://cdn.example.com/serp.jpg",
      }),
      "https://cdn.example.com/serp.jpg",
    );
  });

  it("returns null when no image exists", () => {
    assert.equal(
      resolveArticleImageUrl({
        firecrawlPayload: null,
        serpImageUrl: null,
      }),
      null,
    );
  });
});

describe("extractSerpRowImageUrl", () => {
  it("reads thumbnail.static from Serp rows", () => {
    assert.equal(
      extractSerpRowImageUrl({
        thumbnail: { static: "https://cdn.example.com/thumb.jpg" },
      }),
      "https://cdn.example.com/thumb.jpg",
    );
  });
});

describe("resolveNewsStoryImageUrl", () => {
  it("uses primary source image before secondary", () => {
    const imageByUrl = new Map<string, string | null>([
      ["https://example.com/primary", "https://cdn.example.com/primary.jpg"],
      ["https://example.com/secondary", "https://cdn.example.com/other.jpg"],
    ]);
    const resolved = resolveNewsStoryImageUrl({
      sources: [
        {
          url: "https://example.com/primary",
          sourceType: "google_news",
        },
        {
          url: "https://example.com/secondary",
          sourceType: "google_search",
        },
      ],
      imageByUrl,
    });
    assert.equal(resolved, "https://cdn.example.com/primary.jpg");
  });

  it("falls back to another source when primary has no image", () => {
    const imageByUrl = new Map<string, string | null>([
      ["https://example.com/primary", null],
      ["https://example.com/secondary", "https://cdn.example.com/fallback.jpg"],
    ]);
    const resolved = resolveNewsStoryImageUrl({
      sources: [
        { url: "https://example.com/primary", sourceType: "google_news" },
        { url: "https://example.com/secondary", sourceType: "google_search" },
      ],
      imageByUrl,
    });
    assert.equal(resolved, "https://cdn.example.com/fallback.jpg");
  });
});
