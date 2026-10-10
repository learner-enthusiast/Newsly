import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractYoutubeVideoId,
  indexYoutubeSearchResults,
  normalizeYoutubeVideoSelection,
  youtubeVideoSelectionSchema,
} from "./YoutubeVideoAgent";

describe("extractYoutubeVideoId", () => {
  it("uses video_id when present", () => {
    assert.equal(
      extractYoutubeVideoId({ video_id: "abc123", link: "https://example.com" }),
      "abc123",
    );
  });

  it("parses watch and youtu.be links", () => {
    assert.equal(
      extractYoutubeVideoId({
        link: "https://www.youtube.com/watch?v=UWtOqiokGhg",
      }),
      "UWtOqiokGhg",
    );
    assert.equal(
      extractYoutubeVideoId({ link: "https://youtu.be/xyz789" }),
      "xyz789",
    );
  });

  it("returns null when id cannot be resolved", () => {
    assert.equal(extractYoutubeVideoId({ title: "No link" }), null);
  });
});

describe("indexYoutubeSearchResults", () => {
  it("dedupes by video id and caps at 10", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      video_id: i < 10 ? `id-${i}` : `dup-${i}`,
      title: `Video ${i}`,
    }));
    rows.push({
      video_id: "id-3",
      title: "Duplicate",
    });

    const indexed = indexYoutubeSearchResults(rows);
    assert.equal(indexed.length, 10);
    assert.ok(indexed.every((row) => row.videoId.startsWith("id-")));
  });

  it("skips rows without a usable id", () => {
    const indexed = indexYoutubeSearchResults([
      { title: "missing" },
      { link: "https://www.youtube.com/watch?v=ok1", title: "OK" },
    ]);
    assert.equal(indexed.length, 1);
    assert.equal(indexed[0]?.videoId, "ok1");
  });
});

describe("normalizeYoutubeVideoSelection", () => {
  const allowed = new Set(["news1", "news2", "pick1", "tutorial1"]);

  it("filters unknown ids, re-ranks, and caps at four", () => {
    const result = normalizeYoutubeVideoSelection(
      [
        {
          videoId: "news1",
          rank: 1,
          relevanceScore: 10,
          reason: "Daily market coverage.",
        },
        {
          videoId: "unknown",
          rank: 2,
          relevanceScore: 9,
          reason: "Should drop.",
        },
        {
          videoId: "pick1",
          rank: 4,
          relevanceScore: 3,
          reason: "Stock picks.",
        },
        {
          videoId: "news2",
          rank: 3,
          relevanceScore: 8,
          reason: "Closing analysis.",
        },
        {
          videoId: "extra",
          rank: 5,
          relevanceScore: 7,
          reason: "Over limit.",
        },
      ],
      allowed,
    );

    youtubeVideoSelectionSchema.parse(result);
    assert.equal(result.selectedVideos.length, 3);
    assert.deepEqual(
      result.selectedVideos.map((row) => row.videoId),
      ["news1", "news2", "pick1"],
    );
    assert.deepEqual(
      result.selectedVideos.map((row) => row.rank),
      [1, 2, 3],
    );
  });

  it("keeps the better rank when the model repeats a video id", () => {
    const result = normalizeYoutubeVideoSelection(
      [
        {
          videoId: "news1",
          rank: 3,
          relevanceScore: 7,
          reason: "Worse rank.",
        },
        {
          videoId: "news1",
          rank: 1,
          relevanceScore: 10,
          reason: "Better rank.",
        },
      ],
      new Set(["news1"]),
    );

    assert.equal(result.selectedVideos.length, 1);
    assert.equal(result.selectedVideos[0]?.reason, "Better rank.");
    assert.equal(result.selectedVideos[0]?.rank, 1);
  });

  it("returns empty when nothing is allowed", () => {
    const result = normalizeYoutubeVideoSelection(
      [
        {
          videoId: "x",
          rank: 1,
          relevanceScore: 10,
          reason: "Nope.",
        },
      ],
      new Set(["y"]),
    );
    assert.equal(result.selectedVideos.length, 0);
  });
});
