import assert from "node:assert/strict";
import { test } from "node:test";
import type { VideoScriptListRow } from "@/repositories/videoScript";
import {
  toVideoScriptListItem,
  videoScriptLanguageLabel,
  videoScriptStatusLabel,
} from "@/services/videoScript/videoScriptListItem";

const STORY_ID = "8f0c6a3e-1b2d-4c5e-9f00-112233445566";

function row(overrides: Partial<VideoScriptListRow> = {}): VideoScriptListRow {
  return {
    id: "script_1",
    newsId: STORY_ID,
    status: "done",
    error: null,
    language: "en",
    pace: "normal",
    aspectRatio: "9:16",
    maxSec: 140,
    estimatedSec: 127,
    script: {
      title: "  Sensex hits a record  ",
      hookOptions: ["", "Markets just did something new.", "Third hook"],
      beats: [{}, {}, {}],
    },
    createdAt: new Date("2026-10-20T10:00:00.000Z"),
    updatedAt: new Date("2026-10-20T10:05:00.000Z"),
    newsStory: {
      title: "Sensex closes at all-time high",
      description: "  Benchmarks rallied on bank stocks.  ",
      category: "Markets",
      location: " ",
      imageUrl: " https://cdn.example/a.jpg ",
    },
    ...overrides,
  };
}

test("maps a finished script into a card linking to the story's script page", () => {
  const item = toVideoScriptListItem(row());
  assert.equal(item.href, `/newsStory/${STORY_ID}/script`);
  assert.equal(item.storyId, STORY_ID);
  assert.equal(item.scriptTitle, "Sensex hits a record");
  assert.equal(item.hook, "Markets just did something new.");
  assert.equal(item.beatCount, 3);
  assert.equal(item.statusLabel, "Ready");
  assert.equal(item.statusTone, "ready");
  assert.equal(item.durationSec, 127);
  assert.equal(item.durationIsEstimate, true);
  assert.equal(item.storyDescription, "Benchmarks rallied on bank stocks.");
  assert.equal(item.storyLocation, null);
  assert.equal(item.storyImageUrl, "https://cdn.example/a.jpg");
  assert.equal(item.createdAt, "2026-10-20T10:00:00.000Z");
});

test("a running script shows its stage and the requested max length", () => {
  const item = toVideoScriptListItem(
    row({ status: "fact_checking", estimatedSec: null, script: null }),
  );
  assert.equal(item.statusLabel, "Fact check…");
  assert.equal(item.statusTone, "running");
  assert.equal(item.durationSec, 140);
  assert.equal(item.durationIsEstimate, false);
  assert.equal(item.scriptTitle, null);
  assert.equal(item.hook, null);
  assert.equal(item.beatCount, null);
});

test("failed scripts keep their error; other statuses drop it", () => {
  assert.equal(
    toVideoScriptListItem(row({ status: "failed", error: "boom" })).error,
    "boom",
  );
  assert.equal(
    toVideoScriptListItem(row({ status: "failed", error: "boom" })).statusTone,
    "failed",
  );
  assert.equal(toVideoScriptListItem(row({ error: "stale" })).error, null);
});

test("malformed script JSON never breaks the card", () => {
  for (const script of [[], "text", 42, { title: 7, hookOptions: "x", beats: {} }]) {
    const item = toVideoScriptListItem(row({ script }));
    assert.equal(item.scriptTitle, null);
    assert.equal(item.hook, null);
    assert.equal(item.beatCount, null);
  }
});

test("unknown statuses read as failed rather than running forever", () => {
  const item = toVideoScriptListItem(row({ status: "mystery" }));
  assert.equal(item.statusLabel, "In progress");
  assert.equal(item.statusTone, "failed");
});

test("status and language labels", () => {
  assert.equal(videoScriptStatusLabel("queued"), "Queued");
  assert.equal(videoScriptStatusLabel("researching"), "Research…");
  assert.equal(videoScriptStatusLabel("packaging"), "Publishing…");
  assert.equal(videoScriptLanguageLabel("hi"), "Hindi");
  assert.equal(videoScriptLanguageLabel("en"), "English");
  assert.equal(videoScriptLanguageLabel("fr"), "fr");
});
