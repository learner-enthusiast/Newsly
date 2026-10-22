import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCallBudget } from "@/clients/callTool";
import type { VideoGenerate } from "@/Agents/video/shared/llm";
import type { VideoTools } from "@/services/videoScript/videoTools";
import { createResearchBuilder, type FactExtraction, type ResearchBuilderInput } from "./index";

const LONG = (s: string) => `${s} ${"Background filler sentence. ".repeat(20)}`;

function input(overrides: Partial<ResearchBuilderInput> = {}): ResearchBuilderInput {
  return {
    story: {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Acme raises ₹1,200 crore",
      description: null,
      summary: "Acme raised money.",
      content: "Acme Corp raised ₹1,200 crore on 3 March 2026.",
      category: "Business",
      location: null,
      publishedAt: "2026-10-22T00:00:00.000Z",
      createdAt: "2026-10-22T00:00:00.000Z",
    },
    sources: [
      {
        id: "s1",
        url: "https://a.example/1",
        title: "A",
        domain: "a.example",
        scrapedContent: LONG('CEO Jane Roe said "we will hire 500 people" after the ₹1,200 crore round.'),
        transcript: null,
        publishedAt: null,
      },
      {
        id: "s2",
        url: "https://b.example/2",
        title: "B",
        domain: "b.example",
        scrapedContent: null,
        transcript: null,
        publishedAt: null,
      },
    ],
    now: "2026-10-22T06:00:00.000Z",
    ...overrides,
  };
}

function fakeTools(log: string[]): VideoTools {
  return {
    async scrapeMarkdown(url) {
      log.push(`scrape ${url}`);
      return LONG(`Page ${url} says the round was ₹1,300 crore.`);
    },
    async searchNews(q) {
      log.push(`news ${q}`);
      return [{ url: "https://c.example/3", title: "C", source: "C", isoDate: "2026-10-21T00:00:00Z" }];
    },
    async searchImages() {
      return [];
    },
    async searchPexelsPhotos() {
      return [];
    },
    async searchPexelsVideos() {
      return [];
    },
    pexelsEnabled: () => false,
  };
}

const extraction: FactExtraction = {
  facts: [
    { text: "Acme raised ₹1,200 crore", type: "number", value: "₹1,200 crore", speaker: null, sourceIds: ["s1", "story"], confidence: "high" },
    { text: "Another report says ₹1,300 crore", type: "number", value: "₹1,300 crore", speaker: null, sourceIds: ["s2"], confidence: "medium" },
    { text: "Acme will hire 900 people", type: "number", value: "900", speaker: null, sourceIds: ["s1"], confidence: "high" },
    { text: "Jane Roe on hiring", type: "quote", value: "we will hire 500 people", speaker: "Jane Roe", sourceIds: ["s1"], confidence: "high" },
    { text: "Jane Roe on growth", type: "quote", value: "we are growing fast", speaker: "Jane Roe", sourceIds: ["s1"], confidence: "high" },
    { text: "Cited source does not exist", type: "context", value: null, speaker: null, sourceIds: ["nope"], confidence: "high" },
  ],
  whatHappened: "Acme raised money.",
  whatChanged: "",
  whyItMatters: [],
  whoIsAffected: [],
  openQuestions: [],
  conflicts: [{ factA: 1, factB: 2, note: "amount differs" }],
  isFinance: false,
};

const fakeGenerate = (output: unknown): VideoGenerate =>
  (async () => output) as unknown as VideoGenerate;

describe("researchBuilder", () => {
  it("fetches missing sources, grounds facts and remaps conflicts", async () => {
    const log: string[] = [];
    const run = createResearchBuilder({ tools: fakeTools(log), generate: fakeGenerate(extraction), budget: createCallBudget(10) });
    const result = await run(input());
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;

    assert.deepEqual(log, ["scrape https://b.example/2"], "fresh story with 2 usable sources → no search");
    const texts = result.data.facts.map((f) => f.text);
    assert.deepEqual(texts, ["Acme raised ₹1,200 crore", "Another report says ₹1,300 crore", "Jane Roe on hiring"]);
    assert.deepEqual(result.data.conflicts, [{ factA: "F1", factB: "F2", note: "amount differs" }]);
    assert.deepEqual(result.data.facts[0].sourceUrls, ["https://a.example/1"]);
    assert.equal(result.data.facts[2].speaker, "Jane Roe");
    assert.equal(result.data.isFinance, true, "Business category implies finance");
    assert.equal(result.data.droppedUngroundedFacts, 3);
  });

  it("adds the right source when a number is mis-cited", async () => {
    const miscited: FactExtraction = {
      ...extraction,
      facts: [{ text: "Hiring 500 after a ₹1,200 crore round", type: "number", value: "500", speaker: null, sourceIds: ["story"], confidence: "high" }],
      conflicts: [],
    };
    const run = createResearchBuilder({ tools: fakeTools([]), generate: fakeGenerate(miscited) });
    const result = await run(input());
    assert.equal(result.status, "ok");
    if (result.status === "ok") {
      assert.deepEqual(result.data.facts[0].sourceIds, ["story", "s1"]);
    }
  });

  it("searches news when the story is older than 48h", async () => {
    const log: string[] = [];
    const run = createResearchBuilder({ tools: fakeTools(log), generate: fakeGenerate(extraction) });
    const result = await run(input({ now: "2026-10-25T00:00:00.000Z" }));
    assert.equal(result.status, "ok");
    assert.ok(log.includes("news Acme raises ₹1,200 crore latest"));
    assert.ok(log.includes("scrape https://c.example/3"));
    if (result.status === "ok") {
      assert.ok(result.data.sources.some((s) => s.origin === "search" && s.url === "https://c.example/3"));
    }
  });

  it("returns failed instead of throwing", async () => {
    const run = createResearchBuilder({
      tools: fakeTools([]),
      generate: (async () => {
        throw new Error("model down");
      }) as unknown as VideoGenerate,
    });
    const result = await run(input());
    assert.deepEqual(result, { status: "failed", reason: "researchBuilder: model down" });
    const invalid = await run({ ...input(), now: 5 } as unknown as ResearchBuilderInput);
    assert.equal(invalid.status, "failed");
  });
});
