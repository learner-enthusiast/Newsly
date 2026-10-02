import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isProExpiredPastGrace,
  isProSubscriberPlan,
  PRO_SUBSCRIPTION_GRACE_DAYS,
  proAccessGraceEndsAt,
} from "@/services/billing/userPlanAccess";

describe("isProSubscriberPlan", () => {
  it("returns false for FREE", () => {
    assert.equal(isProSubscriberPlan("FREE", "2020-01-01"), false);
  });

  it("returns true for PRO without period end (legacy)", () => {
    assert.equal(isProSubscriberPlan("PRO", null), true);
  });

  it("returns true within paid period", () => {
    const end = new Date("2030-06-01T00:00:00.000Z");
    assert.equal(isProSubscriberPlan("PRO", end), true);
  });

  it("returns false when period ended beyond grace (2020 end)", () => {
    assert.equal(isProSubscriberPlan("PRO", "2020-01-01T00:00:00.000Z"), false);
  });

  it(`uses ${PRO_SUBSCRIPTION_GRACE_DAYS}-day grace`, () => {
    const end = new Date("2020-01-01T12:00:00.000Z");
    const graceEnds = proAccessGraceEndsAt(end)!;
    assert.equal(
      graceEnds.getTime() - end.getTime(),
      PRO_SUBSCRIPTION_GRACE_DAYS * 24 * 60 * 60 * 1000,
    );
    assert.equal(isProExpiredPastGrace(end, graceEnds.getTime() + 1), true);
    assert.equal(isProExpiredPastGrace(end, graceEnds.getTime() - 1), false);
  });
});
