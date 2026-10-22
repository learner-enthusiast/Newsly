import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCallBudget } from "@/clients/callTool";
import type { VideoGenerate } from "@/Agents/video/shared/llm";
import type { ImageEngine, ImageHit, VideoTools } from "@/services/videoScript/videoTools";
import { createImageFinder, type ImageFinderInput } from "./index";

const hit = (engine: ImageEngine, n: number, extra: Partial<ImageHit> = {}): ImageHit => ({
  source: engine,
  url: `https://img.example/${engine}/${n}.jpg`,
  previewUrl: null,
  pageUrl: `https://site.example/${n}`,
  title: `${engine} ${n}`,
  site: "site.example",
  width: 800,
  height: 800,
  ...extra,
});

function tools(log: string[], pexels = false): VideoTools {
  return {
    async scrapeMarkdown() {
      return null;
    },
    async searchNews() {
      return [];
    },
    async searchImages(engine, q) {
      log.push(`${engine}:${q}`);
      if (engine === "google_images") {
        return [hit(engine, 1), hit(engine, 2, { width: 50, height: 50 }), hit(engine, 3, { url: "x-raw-image:///abc" })];
      }
      return [hit(engine, 1), hit(engine, 2), hit(engine, 3), hit(engine, 4), hit(engine, 5), hit(engine, 6)];
    },
    async searchPexelsPhotos() {
      return [];
    },
    async searchPexelsVideos(q) {
      log.push(`pexels-video:${q}`);
      return [{ source: "pexels", url: "https://v.example/1.mp4", previewUrl: null, pageUrl: "https://pexels.example/v/1", title: null, durationSec: 8 }];
    },
    pexelsEnabled: () => pexels,
  };
}

const input: ImageFinderInput = {
  aspectRatio: "9:16",
  beats: [
    { index: 0, overlayType: "logo", searchQueries: ["Acme official logo"], spokenText: "Acme raised money." },
    { index: 1, overlayType: "chart", searchQueries: [], spokenText: "Revenue up." },
    { index: 2, overlayType: "video_broll", searchQueries: ["factory floor"], spokenText: "In its factories." },
  ],
};

const ranker = (async (params: { extraContext?: unknown }) => {
  const beats = (params.extraContext as { beats: Array<{ index: number; candidates: unknown[] }> }).beats;
  return {
    beats: beats.map((beat) => ({
      index: beat.index,
      ranked: beat.candidates.map((_, i) => ({ candidate: beat.candidates.length - 1 - i, relevance: i === 0 ? "high" : "low" })),
    })),
  };
}) as unknown as VideoGenerate;

describe("imageFinder", () => {
  it("falls through engines until 3 usable results and ranks top 4", async () => {
    const log: string[] = [];
    const run = createImageFinder({ tools: tools(log), generate: ranker, budget: createCallBudget(10) });
    const result = await run(input);
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;

    assert.deepEqual(log, ["google_images:Acme official logo", "google_images_light:Acme official logo"], "bing not needed");
    const logo = result.data.beats.find((b) => b.index === 0)!;
    assert.equal(logo.candidates.length, 4);
    assert.deepEqual(logo.candidates.map((c) => c.rank), [0, 1, 2, 3]);
    assert.equal(logo.candidates[0].url, "https://img.example/google_images_light/5.jpg", "ranker order applied");
    assert.equal(logo.candidates[0].relevance, "high");
    assert.equal(logo.goodResult, true);
    assert.equal(result.data.beats.some((b) => b.index === 1), false, "charts are not searched");

    const broll = result.data.beats.find((b) => b.index === 2)!;
    assert.equal(broll.skipped, "PEXELS_API_KEY not set");
    assert.equal(broll.goodResult, false);
  });

  it("searches every company query for a logo beat and shares the slots", async () => {
    const log: string[] = [];
    const run = createImageFinder({ tools: tools(log), generate: ranker });
    const result = await run({
      aspectRatio: "16:9",
      beats: [{ index: 0, overlayType: "logo", searchQueries: ["Acme official logo", "Beta official logo"], spokenText: "Acme and Beta." }],
    });
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.ok(log.includes("google_images:Beta official logo"));
    const queries = result.data.beats[0].candidates.map((c) => c.query);
    assert.ok(queries.includes("Acme official logo") && queries.includes("Beta official logo"));
  });

  it("uses Pexels videos for b-roll when the key exists, unranked if ranking fails", async () => {
    const log: string[] = [];
    const run = createImageFinder({
      tools: tools(log, true),
      generate: (async () => {
        throw new Error("ranker down");
      }) as unknown as VideoGenerate,
    });
    const result = await run(input);
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.data.ranked, false);
    const broll = result.data.beats.find((b) => b.index === 2)!;
    assert.equal(broll.candidates[0].kind, "video");
    assert.equal(broll.candidates[0].relevance, "unranked");
    assert.equal(broll.goodResult, true);
  });
});
