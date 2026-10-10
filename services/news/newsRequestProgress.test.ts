import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveProgressSteps,
  formatNewsScopeLabel,
  sanitizeNewsRequestError,
} from "./newsRequestProgress";

describe("deriveProgressSteps", () => {
  it("marks early steps done from loading logs while pending", () => {
    const steps = deriveProgressSteps(
      [
        "Request accepted; pipeline queued.",
        "Pipeline started.",
        "Search queries planned.",
        "Finding relevant stories.",
        "Checking sources.",
      ],
      "pending",
    );
    assert.equal(steps[0]?.state, "done");
    assert.equal(steps[1]?.state, "done");
    assert.equal(steps[2]?.state, "done");
    assert.equal(steps[3]?.state, "active");
    assert.equal(steps[4]?.state, "pending");
  });

  it("marks all steps done on success", () => {
    const steps = deriveProgressSteps(["Request accepted"], "success");
    assert.ok(steps.every((step) => step.state === "done"));
  });
});

describe("sanitizeNewsRequestError", () => {
  it("hides stack-like errors", () => {
    const message = sanitizeNewsRequestError("Error: boom\n    at foo (bar.ts:1:1)");
    assert.equal(message, "Something went wrong while generating your briefing.");
  });

  it("keeps short user-safe messages", () => {
    assert.equal(
      sanitizeNewsRequestError("No articles returned from Serp normalization"),
      "No articles returned from Serp normalization",
    );
  });
});

describe("formatNewsScopeLabel", () => {
  it("labels both scope", () => {
    assert.equal(formatNewsScopeLabel("both"), "Local + world");
  });
});
