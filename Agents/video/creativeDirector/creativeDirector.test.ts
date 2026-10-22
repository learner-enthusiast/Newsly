import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fakeGenerate, fixtureFactSheet, fixtureScript } from "@/Agents/video/shared/testFixtures";
import { createCreativeDirector, type DirectionDraft } from "./index";

const editing = { transitionIn: "cut", transitionOut: "whip", motion: "push-in", textAnimation: null, speakerFraming: "normal" as const, sfx: null, musicCue: null };

const draft: DirectionDraft = {
  beats: [
    { index: 0, overlayType: "logo", searchQueries: [], preferGenerative: true, editing: { ...editing, speakerFraming: "punch-in 115%" }, editorNote: "Logo reveal." },
    { index: 1, overlayType: "text_card", searchQueries: ["should be dropped"], preferGenerative: false, editing, editorNote: "Name callout." },
    { index: 2, overlayType: "image", searchQueries: [" court ", "court", "a", "b"], preferGenerative: false, editing: { ...editing, sfx: " whoosh " }, editorNote: "" },
    { index: 3, overlayType: "none", searchQueries: [], preferGenerative: true, editing, editorNote: "Speaker alone, up 45%." },
  ],
  global: { pacing: "fast", hookTreatment: "", subtitleStyle: "bold", colorTreatment: "warm", musicMood: "tense" },
};

describe("creativeDirector", () => {
  it("normalises direction and covers every beat", async () => {
    const run = createCreativeDirector({ generate: fakeGenerate(draft) });
    const result = await run({ script: fixtureScript(), factSheet: fixtureFactSheet(), aspectRatio: "9:16", language: "en" });
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    const beats = result.data.beats;
    assert.equal(beats.length, 5, "missing beat 4 filled in");
    assert.deepEqual(beats[0].searchQueries, ["Acme just raised ₹1,200 crore. official logo"]);
    assert.equal(beats[0].preferGenerative, false, "logos are never generative");
    assert.deepEqual(beats[1].searchQueries, [], "text cards are not searched");
    assert.deepEqual(beats[2].searchQueries, ["court", "a", "b"]);
    assert.equal(beats[2].editing.sfx, "whoosh");
    assert.equal(beats[2].editorNote, "See overlay.");
    assert.equal(beats[3].needsVisual, false);
    assert.equal(beats[3].preferGenerative, false);
    assert.equal(beats[3].editorNote, "Speaker alone, up 45%. (Check figures against the fact sheet.)");
    assert.equal(beats[0].editorNote, "Logo reveal.");
    assert.equal(beats[4].overlayType, "none");
    assert.ok(beats.every((b) => b.editing.transitionIn && b.editorNote));
    assert.ok(result.data.global.hookTreatment.length > 0);
  });

  it("returns failed instead of throwing", async () => {
    const run = createCreativeDirector({ generate: (async () => { throw new Error("nope"); }) as never });
    const result = await run({ script: fixtureScript(), factSheet: fixtureFactSheet(), aspectRatio: "16:9", language: "hi" });
    assert.equal(result.status, "failed");
  });
});
