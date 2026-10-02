import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isFatalPollError,
  shouldScheduleNextPoll,
} from "./newsRequestPollingLogic";

describe("shouldScheduleNextPoll", () => {
  it("continues while pending or rerunning", () => {
    assert.equal(
      shouldScheduleNextPoll({ status: "pending", isRerunning: false }),
      true,
    );
    assert.equal(
      shouldScheduleNextPoll({ status: "success", isRerunning: true }),
      true,
    );
    assert.equal(
      shouldScheduleNextPoll({ status: "success", isRerunning: false }),
      false,
    );
    assert.equal(
      shouldScheduleNextPoll({ status: "failed", isRerunning: false }),
      false,
    );
  });
});

describe("isFatalPollError", () => {
  it("treats not found and unauthorized as fatal", () => {
    assert.equal(isFatalPollError("Not found"), true);
    assert.equal(isFatalPollError("Unauthorized"), true);
    assert.equal(isFatalPollError("Connection issue"), false);
  });
});
