import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractTopYoutubeVideoResults,
  transcriptTextFromSerpPayload,
} from "./youtubeResearch";

describe("extractTopYoutubeVideoResults", () => {
  it("returns at most 10 parsed video_results rows", () => {
    const payload = {
      video_results: Array.from({ length: 12 }, (_, i) => ({
        video_id: `id-${i}`,
        title: `Title ${i}`,
      })),
    };
    const rows = extractTopYoutubeVideoResults(payload, 10);
    assert.equal(rows.length, 10);
    assert.equal(rows[0]?.video_id, "id-0");
    assert.equal(rows[9]?.video_id, "id-9");
  });
});

describe("transcriptTextFromSerpPayload", () => {
  it("joins snippet segments", () => {
    const text = transcriptTextFromSerpPayload({
      transcript: [{ snippet: "Hello" }, { snippet: "world" }],
    });
    assert.equal(text, "Hello world");
  });

  it("returns null when transcript is missing", () => {
    assert.equal(transcriptTextFromSerpPayload({}), null);
  });
});
