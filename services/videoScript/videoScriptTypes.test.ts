import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createVideoScriptBodySchema,
  groupAssetsByBeat,
  resolveMinSec,
  resolveStageStates,
  shouldReuseVideoScript,
  VIDEO_SCRIPT_STAGES,
  type VisualAssetPayload,
} from "./videoScriptTypes";

describe("createVideoScriptBodySchema", () => {
  it("fills defaults for an empty body", () => {
    assert.deepEqual(createVideoScriptBodySchema.parse({}), {
      language: "en",
      maxSec: 140,
      pace: "normal",
      aspectRatio: "9:16",
      regenerate: false,
    });
  });

  it("rejects maxSec outside 30–180 and unknown enums", () => {
    assert.equal(createVideoScriptBodySchema.safeParse({ maxSec: 29 }).success, false);
    assert.equal(createVideoScriptBodySchema.safeParse({ maxSec: 181 }).success, false);
    assert.equal(createVideoScriptBodySchema.safeParse({ language: "fr" }).success, false);
    assert.equal(createVideoScriptBodySchema.safeParse({ aspectRatio: "1:1" }).success, false);
  });
});

describe("resolveMinSec", () => {
  it("caps the 60s floor at maxSec", () => {
    assert.equal(resolveMinSec(140), 60);
    assert.equal(resolveMinSec(30), 30);
  });
});

describe("shouldReuseVideoScript", () => {
  it("reuses an existing non-failed script unless regenerating", () => {
    assert.equal(shouldReuseVideoScript(null, false), false);
    assert.equal(shouldReuseVideoScript({ status: "scripting" }, false), true);
    assert.equal(shouldReuseVideoScript({ status: "done" }, false), true);
    assert.equal(shouldReuseVideoScript({ status: "done" }, true), false);
    assert.equal(shouldReuseVideoScript({ status: "failed" }, false), false);
  });
});

describe("resolveStageStates", () => {
  it("marks earlier stages complete and the current one active", () => {
    const states = resolveStageStates("fact_checking");
    assert.deepEqual(states.slice(0, 4), ["complete", "complete", "active", "pending"]);
  });

  it("is all pending when queued or failed, all complete when done", () => {
    const n = VIDEO_SCRIPT_STAGES.length;
    assert.deepEqual(resolveStageStates("queued"), Array(n).fill("pending"));
    assert.deepEqual(resolveStageStates("failed"), Array(n).fill("pending"));
    assert.deepEqual(resolveStageStates("done"), Array(n).fill("complete"));
  });
});

describe("groupAssetsByBeat", () => {
  it("groups by beat index and orders by rank", () => {
    const asset = (beatIndex: number, rank: number) =>
      ({ id: `${beatIndex}-${rank}`, beatIndex, rank }) as VisualAssetPayload;
    const grouped = groupAssetsByBeat([asset(2, 1), asset(0, 0), asset(2, 0)]);
    assert.deepEqual(Object.keys(grouped).sort(), ["0", "2"]);
    assert.deepEqual(grouped["2"].map((a) => a.id), ["2-0", "2-1"]);
  });
});
