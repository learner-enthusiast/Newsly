import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isFatalPollError,
  shouldScheduleNextPoll,
} from "./newsRequestPollingLogic";

describe("shouldScheduleNextPoll", () => {
  it("continues only while pending", () => {
    assert.equal(shouldScheduleNextPoll("pending"), true);
    assert.equal(shouldScheduleNextPoll("success"), false);
    assert.equal(shouldScheduleNextPoll("failed"), false);
  });
});

describe("isFatalPollError", () => {
  it("treats not found and unauthorized as fatal", () => {
    assert.equal(isFatalPollError("Not found"), true);
    assert.equal(isFatalPollError("Unauthorized"), true);
    assert.equal(isFatalPollError("Connection issue"), false);
  });
});
