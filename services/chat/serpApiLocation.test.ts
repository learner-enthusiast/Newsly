import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeSerpApiLocation,
  serpSearchWithLocationFallback,
} from "./serpApiLocation";

describe("normalizeSerpApiLocation", () => {
  it("maps Delhi NCR to Delhi, India", () => {
    assert.equal(
      normalizeSerpApiLocation("Delhi NCR, India"),
      "Delhi, India",
    );
  });

  it("leaves supported locations unchanged", () => {
    assert.equal(normalizeSerpApiLocation("Delhi, India"), "Delhi, India");
  });
});

describe("serpSearchWithLocationFallback", () => {
  it("retries without location when Serp rejects location", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const payload = await serpSearchWithLocationFallback(async (params) => {
      calls.push(params);
      if ("location" in params) {
        throw new Error(
          'Unsupported `Delhi NCR, India` location - location parameter.',
        );
      }
      return { organic_results: [] };
    }, {
      q: "diesel exports",
      location: "Delhi NCR, India",
    });

    assert.deepEqual(calls.length, 2);
    assert.equal(calls[0]!.location, "Delhi, India");
    assert.equal("location" in calls[1]!, false);
    assert.ok(payload);
  });
});
