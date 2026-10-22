import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FactSheet } from "@/Agents/video/researchBuilder/schema";
import type { VideoGenerate } from "@/Agents/video/shared/llm";
import { createScriptWriter, planLength, type ScriptDraft, type ScriptOptions } from "./index";

function factSheet(strongFacts: number, isFinance = false): FactSheet {
  return {
    facts: Array.from({ length: strongFacts }, (_, i) => ({
      id: `F${i + 1}`,
      text: `Fact ${i + 1}`,
      type: "event" as const,
      sourceIds: ["s1"],
      sourceUrls: ["https://a.example"],
      confidence: "high" as const,
    })),
    whatHappened: "x",
    whatChanged: "",
    whyItMatters: [],
    whoIsAffected: [],
    openQuestions: [],
    conflicts: [],
    isFinance,
    sources: [],
    searchQueries: [],
    droppedUngroundedFacts: 0,
    droppedFacts: [],
  };
}

const options: ScriptOptions = { language: "en", minSec: 60, maxSec: 140, pace: "normal", aspectRatio: "9:16" };
const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

function draft(beatWords: number[], optional: number[] = []): ScriptDraft {
  return {
    title: "T",
    // Too long to fit the hook, so no hook swap unless a test sets its own.
    hookOptions: [words(50), words(50), words(50)],
    beats: beatWords.map((n, i) => ({
      spokenText: words(n),
      onScreenText: i === 1 ? "one two three four five six seven" : null,
      kind: "fact",
      factIds: i === 1 ? ["F1", "F999"] : [],
      priority: optional.includes(i) ? "optional" : "core",
      cutNote: null,
    })),
    cta: "Follow for more",
  };
}

/** Answers draft requests with `output`; short-hook requests with hooks too long to swap in. */
const gen = (output: unknown): VideoGenerate =>
  (async (params: { schemaName?: string }) =>
    params.schemaName === "VideoShortHooks" ? { hooks: [words(50), words(50), words(50)] } : output) as unknown as VideoGenerate;

describe("planLength", () => {
  it("bands by strong fact count and clamps to maxSec", () => {
    assert.deepEqual(planLength(factSheet(4), options), { band: "thin", minSec: 60, maxSec: 75, strongFacts: 4 });
    assert.equal(planLength(factSheet(10), options).band, "normal");
    assert.deepEqual(planLength(factSheet(20), options), { band: "rich", minSec: 120, maxSec: 140, strongFacts: 20 });
    assert.deepEqual(planLength(factSheet(20), { ...options, maxSec: 90 }), { band: "rich", minSec: 90, maxSec: 90, strongFacts: 20 });
  });
});

describe("scriptWriter", () => {
  it("times beats from cumulative words and cleans fields", async () => {
    const run = createScriptWriter({ generate: gen(draft([12, 24, 24, 24, 24, 24, 24, 12])) });
    const result = await run({ factSheet: factSheet(4), story: { title: "S", category: "Tech" }, options });
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    const { beats } = result.data;
    assert.deepEqual([beats[0].startSec, beats[0].endSec, beats[1].endSec], [0, 5, 15]);
    assert.equal(result.data.wordCount, 168);
    assert.equal(result.data.estimatedSec, 70);
    assert.equal(beats[1].onScreenText, "one two three four five six");
    assert.deepEqual(beats[1].factIds, ["F1"]);
    assert.equal(beats[0].kind, "explain", "fact beat without known facts becomes explain");
    assert.match(result.data.lengthReason, /thin story/);
    assert.equal(result.data.disclaimer, undefined);
  });

  it("drops optional beats (not hook/CTA) past the soft limit", async () => {
    // 10 beats × 40 words = 400 words ≈ 167s at 2.4 wps; limit 140 × 1.1 × 2.4 ≈ 370 words.
    const run = createScriptWriter({ generate: gen(draft(Array(10).fill(40), [0, 3, 8, 9])) });
    const result = await run({ factSheet: factSheet(20, true), story: { title: "S", category: "Markets" }, options });
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.data.beats.length, 9);
    assert.equal(result.data.wordCount, 360);
    assert.deepEqual(result.data.beats.map((b) => b.index), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(result.data.beats[0].priority, "optional", "hook kept even if optional");
    assert.equal(result.data.beats.at(-1)?.priority, "optional", "CTA kept even if optional");
    assert.equal(result.data.disclaimer, "For information only, not investment advice.");
  });

  it("uses Hindi speaking rates", async () => {
    const run = createScriptWriter({ generate: gen(draft(Array(8).fill(22))) });
    const result = await run({ factSheet: factSheet(4), story: { title: "S", category: "x" }, options: { ...options, language: "hi" } });
    assert.equal(result.status === "ok" && result.data.estimatedSec, 80);
  });

  it("fails without throwing on a bad draft", async () => {
    const run = createScriptWriter({ generate: gen({ ...draft([10]), hookOptions: ["only one"] }) });
    const result = await run({ factSheet: factSheet(4), story: { title: "S", category: "x" }, options });
    assert.equal(result.status, "failed");
  });
});

describe("scriptWriter length retry", () => {
  it("asks once for a longer draft when the first is too short", async () => {
    const calls: string[] = [];
    const generate = (async (params: { prompt: string; schemaName?: string }) => {
      if (params.schemaName === "VideoShortHooks") {
        return { hooks: [words(50), words(50), words(50)] };
      }
      calls.push(params.prompt);
      return calls.length === 1 ? draft(Array(8).fill(10)) : draft(Array(10).fill(25));
    }) as unknown as VideoGenerate;
    const run = createScriptWriter({ generate });
    const result = await run({ factSheet: factSheet(10), story: { title: "S", category: "x" }, options });
    assert.equal(calls.length, 2);
    assert.match(calls[1], /only 80 spoken words; it needs 216–288/);
    assert.equal(result.status === "ok" && result.data.wordCount, 250);
  });
});

describe("hook length", () => {
  it("swaps in a hook option that fits 5s", async () => {
    const d = draft([20, 24, 24, 24, 24, 24, 24, 10]);
    d.hookOptions = [words(30), "short punchy hook", "another"];
    const run = createScriptWriter({ generate: gen(d) });
    const result = await run({ factSheet: factSheet(4), story: { title: "S", category: "x" }, options });
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.data.beats[0].spokenText, "short punchy hook");
    assert.equal(result.data.hookOptions[1], words(20));
  });
});

describe("hook split", () => {
  it("splits a long hook after its first sentence when no option fits", async () => {
    const d = draft([12, 24, 24, 24, 24, 24, 24, 10]);
    d.beats[0].spokenText = `Short opener here. ${words(30)}.`;
    const run = createScriptWriter({ generate: gen(d) });
    const result = await run({ factSheet: factSheet(4), story: { title: "S", category: "x" }, options });
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.data.beats[0].spokenText, "Short opener here.");
    assert.equal(result.data.beats[1].spokenText, `${words(30)}.`);
    assert.equal(result.data.beats.length, 9);
  });
});

describe("short hook request", () => {
  it("asks for short hooks when nothing fits, then swaps one in", async () => {
    const d = draft([30, 24, 24, 24, 24, 24, 24, 10]);
    const prompts: string[] = [];
    const generate = (async (params: { prompt: string; schemaName?: string }) => {
      prompts.push(params.schemaName ?? "");
      return params.schemaName === "VideoShortHooks" ? { hooks: ["Big news today", words(20), "Why now?"] } : d;
    }) as unknown as VideoGenerate;
    const run = createScriptWriter({ generate });
    const result = await run({ factSheet: factSheet(4), story: { title: "S", category: "x" }, options });
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.deepEqual(prompts, ["VideoScriptDraft", "VideoShortHooks"]);
    assert.equal(result.data.beats[0].spokenText, "Big news today");
    assert.equal(result.data.hookOptions[0], words(30));
  });
});
