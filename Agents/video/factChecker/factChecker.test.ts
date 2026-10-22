import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FactSheet } from "@/Agents/video/researchBuilder/schema";
import type { ScriptOutput } from "@/Agents/video/scriptWriter/schema";
import type { VideoGenerate } from "@/Agents/video/shared/llm";
import { extractNumbers, numbersMatch } from "@/Agents/video/shared/numbers";
import { createFactChecker, factSheetNumbers, quoteIssues } from "./index";

const factSheet: FactSheet = {
  facts: [
    { id: "F1", text: "Acme raised ₹1,200 crore", type: "number", value: "₹1,200 crore", sourceIds: ["s1"], sourceUrls: [], confidence: "high" },
    { id: "F2", text: "Jane Roe is the CEO of Acme", type: "name", sourceIds: ["s1"], sourceUrls: [], confidence: "high" },
    { id: "F3", text: "The round closed in 2026", type: "date", value: "2026", sourceIds: ["s1"], sourceUrls: [], confidence: "high" },
  ],
  whatHappened: "Acme raised money.",
  whatChanged: "",
  whyItMatters: [],
  whoIsAffected: [],
  openQuestions: [],
  conflicts: [],
  isFinance: false,
  sources: [],
  searchQueries: [],
  droppedUngroundedFacts: 0,
    droppedFacts: [],
};

const texts = [
  "Acme just raised 1200 cr.",
  "It will hire 900 people. Jane Roe leads it.",
  "Shares jumped 20% today.",
  "John Doe agreed. Acme confirmed the round.",
  "That happened in 2026.",
  "Here's why it matters.",
  "Watch what Acme does next.",
  "Follow for more.",
];

const script: ScriptOutput = {
  title: "Acme's 50x moment",
  hookOptions: ["Acme raised ₹1,200 crore", "Is this 2026's biggest round?", "Why 7 investors said yes"],
  beats: texts.map((spokenText, index) => ({
    index,
    startSec: index * 2,
    endSec: index * 2 + 2,
    spokenText,
    kind: "explain" as const,
    factIds: [],
    priority: "core" as const,
  })),
  cta: "Follow for more.",
  wordCount: 40,
  estimatedSec: 17,
  lengthReason: "thin",
  wordsPerSecond: 2.4,
};

type Ctx = { beats: Array<{ index: number; spokenText: string }> };

const fakeGenerate = (async (params: { schemaName?: string; extraContext?: unknown }) => {
  const ctx = params.extraContext as Ctx;
  if (params.schemaName === "VideoScriptAudit") {
    return {
      beats: ctx.beats.map((beat) => ({
        index: beat.index,
        issues: beat.spokenText.includes("John Doe")
          ? [{ span: "John Doe", problem: "John Doe is not in the fact sheet" }]
          : [],
      })),
    };
  }
  // Rewrite: fixes beat 1, makes beat 2 worse, skips beat 3; fixes hook 3 only.
  const extras = (params.extraContext as { titleAndHooks: Array<{ index: number }> }).titleAndHooks;
  return {
    beats: [
      ...extras.flatMap((extra) => (extra.index === 1003 ? [{ index: 1003, spokenText: "Why investors said yes", onScreenText: null }] : [])),
      ...ctx.beats.flatMap((beat) =>
      beat.index === 1
        ? [{ index: 1, spokenText: "Jane Roe leads Acme.", onScreenText: null }]
        : beat.index === 2
          ? [{ index: 2, spokenText: "Shares jumped 25%.", onScreenText: null }]
          : [],
      ),
    ],
  };
}) as unknown as VideoGenerate;

describe("factChecker", () => {
  it("fixes, removes claims and drops unsupported beats", async () => {
    const run = createFactChecker({ generate: fakeGenerate });
    const result = await run({ factSheet, script, storyTitle: "Acme funding", language: "en" });
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    const { factCheck, script: out } = result.data;

    assert.deepEqual(
      factCheck.beats.map((b) => [b.index, b.status]),
      [[0, "ok"], [1, "fixed"], [2, "removed_claim"], [3, "ok"], [4, "ok"], [5, "ok"], [6, "ok"]],
    );
    assert.deepEqual(factCheck.removedBeats.map((b) => b.originalIndex), [2]);
    assert.equal(out.beats[1].spokenText, "Jane Roe leads Acme.");
    assert.equal(out.beats[2].spokenText, "Acme confirmed the round.");
    assert.equal(out.beats.length, 7);
    assert.deepEqual(out.beats.map((b) => b.index), [0, 1, 2, 3, 4, 5, 6]);
    assert.equal(out.title, "Acme funding", "title with unsupported number falls back");
    assert.equal(out.hookOptions[2], "Why investors said yes", "rewritten hook used");
    assert.equal(factCheck.passed, true);
  });

  it("every number in the final script exists in the FactSheet", async () => {
    const run = createFactChecker({ generate: fakeGenerate });
    const result = await run({ factSheet, script, storyTitle: "Acme funding", language: "en" });
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    const allowed = factSheetNumbers(factSheet);
    const out = result.data.script;
    const scriptText = [
      out.title,
      ...out.hookOptions,
      out.cta,
      ...out.beats.flatMap((b) => [b.spokenText, b.onScreenText ?? ""]),
    ].join("\n");
    const numbers = extractNumbers(scriptText);
    assert.ok(numbers.length > 0);
    for (const token of numbers) {
      assert.ok(
        allowed.some((fact) => numbersMatch(token, fact)),
        `"${token.raw}" is not in the FactSheet`,
      );
    }
  });

  it("returns failed when the model errors", async () => {
    const run = createFactChecker({
      generate: (async () => {
        throw new Error("timeout");
      }) as unknown as VideoGenerate,
    });
    const result = await run({ factSheet, script, storyTitle: "x", language: "en" });
    assert.equal(result.status, "failed");
  });
});

describe("quoteIssues", () => {
  const quotes = ["i feel like i'm tap dancing through a minefield"];
  it("accepts verbatim excerpts and ignores apostrophes", () => {
    assert.deepEqual(quoteIssues("He's 'tap dancing through a minefield.' he said", quotes), []);
    assert.deepEqual(quoteIssues("He said “I feel like I'm tap dancing through a minefield”", quotes), []);
  });
  it("flags invented quotes but skips Hindi translations", () => {
    assert.equal(quoteIssues('He said "this is huge"', quotes).length, 1);
    assert.deepEqual(quoteIssues('उन्होंने कहा "यह बड़ी बात है"', quotes), []);
  });
});
