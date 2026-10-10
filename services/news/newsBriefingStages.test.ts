import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  funnelStage,
  needsScrapeBackfill,
  scrapeBackfillBatch,
} from "./newsBriefingStages";

describe("scrape backfill", () => {
  it("backfills only when cleaned articles are short of N + margin", () => {
    assert.equal(needsScrapeBackfill(5, 3, 10), true);
    assert.equal(needsScrapeBackfill(5, 6, 10), false);
    assert.equal(needsScrapeBackfill(5, 2, 0), false);
  });

  it("sizes the batch at 2x the gap, at least N", () => {
    const reserve = Array.from({ length: 20 }, (_, i) => i);
    assert.equal(scrapeBackfillBatch(reserve, 5, 4).length, 5);
    assert.equal(scrapeBackfillBatch(reserve, 5, 0).length, 12);
  });
});

describe("funnelStage", () => {
  it("counts per region", () => {
    assert.deepEqual(
      funnelStage("x", [{ region: "local" }, { region: "world" }, { region: "world" }, {}]),
      { stage: "x", total: 4, local: 1, world: 2 },
    );
  });
});
