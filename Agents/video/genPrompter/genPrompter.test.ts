import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fakeGenerate, fixtureFactSheet } from "@/Agents/video/shared/testFixtures";
import type { VideoGenerate } from "@/Agents/video/shared/llm";
import { blockedNames, createGenPrompter, isSafePrompt, needsGenPrompts, type GenPrompterInput, type PromptDraft } from "./index";

const beat = (index: number, overrides: Partial<GenPrompterInput["beats"][number]> = {}) => ({
  index,
  overlayType: "image" as const,
  needsVisual: true,
  preferGenerative: false,
  goodResult: false,
  spokenText: "x",
  editorNote: "y",
  ...overrides,
});

const factSheet = fixtureFactSheet({
  facts: [
    ...fixtureFactSheet().facts,
    { id: "F9", text: "Jane Roe said it was huge", type: "quote", value: "it was huge", speaker: "Jane Roe", sourceIds: ["s1"], sourceUrls: [], confidence: "high" },
  ],
});

describe("needsGenPrompts", () => {
  it("only image/b-roll beats without a good result or preferring generative", () => {
    assert.equal(needsGenPrompts(beat(0)), true);
    assert.equal(needsGenPrompts(beat(0, { goodResult: true })), false);
    assert.equal(needsGenPrompts(beat(0, { goodResult: true, preferGenerative: true })), true);
    assert.equal(needsGenPrompts(beat(0, { overlayType: "logo" })), false);
    assert.equal(needsGenPrompts(beat(0, { overlayType: "chart" })), false);
    assert.equal(needsGenPrompts(beat(0, { needsVisual: false })), false);
  });
});

describe("safety guard", () => {
  it("blocks real names, logos, documents and headlines", () => {
    const names = blockedNames(factSheet);
    assert.ok(names.includes("Jane") && names.includes("Roe") && names.includes("Acme"));
    assert.equal(names.includes("CEO"), false);
    assert.equal(isSafePrompt("Portrait of Jane Roe in an office", names), false);
    assert.equal(isSafePrompt("An Acme branded truck", names), false);
    assert.equal(isSafePrompt("Close-up of a company logo on glass", names), false);
    assert.equal(isSafePrompt("Newspaper front page announcing the deal", names), false);
    assert.equal(isSafePrompt("Busy trading floor seen from behind, warm light", names), true);
  });
});

describe("genPrompter", () => {
  it("returns prompts for selected beats only and drops unsafe ones", async () => {
    const draft: PromptDraft = {
      beats: [
        {
          index: 0,
          imagePrompts: [
            { prompt: "Empty boardroom at dusk, editorial photo", negativePrompt: "text, logos", style: "editorial", notes: "background" },
            { prompt: "Jane Roe shaking hands", negativePrompt: null, style: "photo", notes: "" },
          ],
          videoPrompts: [{ prompt: "Slow dolly across server racks", negativePrompt: null, style: "cinematic", durationSec: 4, cameraMove: "dolly", notes: "b-roll" }],
        },
        { index: 1, imagePrompts: [{ prompt: "should not be used", negativePrompt: null, style: "x", notes: "" }], videoPrompts: [] },
      ],
    };
    const run = createGenPrompter({ generate: fakeGenerate(draft) });
    const result = await run({ beats: [beat(0), beat(1, { goodResult: true })], factSheet, aspectRatio: "9:16" });
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.data.beats.length, 1);
    const [row] = result.data.beats;
    assert.deepEqual(row.prompts.map((p) => [p.kind, p.prompt]), [
      ["image", "Empty boardroom at dusk, editorial photo"],
      ["video", "Slow dolly across server racks"],
    ]);
    assert.equal(row.blocked, 1);
    assert.equal(row.prompts[1].durationSec, 4);
    assert.equal(row.prompts[0].aspectRatio, "9:16");
  });

  it("skips the LLM entirely when no beat needs prompts", async () => {
    let called = false;
    const run = createGenPrompter({ generate: (async () => { called = true; return { beats: [] }; }) as unknown as VideoGenerate });
    const result = await run({ beats: [beat(0, { goodResult: true })], factSheet, aspectRatio: "16:9" });
    assert.deepEqual(result, { status: "ok", data: { beats: [] } });
    assert.equal(called, false);
  });
});
