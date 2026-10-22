import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  callTool,
  callToolCacheKey,
  createCallBudget,
  type ToolCallCacheStore,
} from "./callTool";

function memoryCache(): ToolCallCacheStore & { size: () => number } {
  const rows = new Map<string, { value: unknown; expiresAt: Date }>();
  return {
    async get(key, now) {
      const row = rows.get(key);
      return row && row.expiresAt > now ? row.value : undefined;
    },
    async set(key, _tool, value, expiresAt) {
      rows.set(key, { value, expiresAt });
    },
    size: () => rows.size,
  };
}

describe("callToolCacheKey", () => {
  it("ignores key order and undefined values", () => {
    assert.equal(
      callToolCacheKey("t", { a: 1, b: { c: 2, d: undefined } }),
      callToolCacheKey("t", { b: { c: 2 }, a: 1 }),
    );
    assert.notEqual(callToolCacheKey("t", { a: 1 }), callToolCacheKey("u", { a: 1 }));
  });
});

describe("callTool", () => {
  it("caches results and serves hits without spending budget", async () => {
    const cache = memoryCache();
    const budget = createCallBudget(1);
    let calls = 0;
    const run = async () => ({ n: ++calls });
    const opts = { tool: "t", params: { q: "x" }, ttlMs: 60_000, budget, cache, run };
    assert.deepEqual(await callTool(opts), { n: 1 });
    assert.deepEqual(await callTool(opts), { n: 1 });
    assert.equal(calls, 1);
    assert.equal(budget.used, 1);
  });

  it("retries after 1s, 2s, 4s then returns null", async () => {
    const delays: number[] = [];
    const result = await callTool({
      tool: "t",
      params: {},
      ttlMs: 1,
      budget: createCallBudget(5),
      cache: memoryCache(),
      sleep: async (ms) => void delays.push(ms),
      run: async () => {
        throw new Error("boom");
      },
    });
    assert.equal(result, null);
    assert.deepEqual(delays, [1_000, 2_000, 4_000]);
  });

  it("succeeds on a retry and does not cache failures", async () => {
    const cache = memoryCache();
    let attempt = 0;
    const result = await callTool({
      tool: "t",
      params: {},
      ttlMs: 60_000,
      budget: createCallBudget(5),
      cache,
      sleep: async () => {},
      run: async () => ++attempt,
      isFailure: (value) => value < 2,
    });
    assert.equal(result, 2);
    assert.equal(cache.size(), 1);
  });

  it("returns null without calling when the budget is spent", async () => {
    let called = false;
    const result = await callTool({
      tool: "t",
      params: {},
      ttlMs: 1,
      budget: createCallBudget(0),
      cache: memoryCache(),
      run: async () => {
        called = true;
        return 1;
      },
    });
    assert.equal(result, null);
    assert.equal(called, false);
  });

  it("expires cache rows after the TTL", async () => {
    const cache = memoryCache();
    let t = 0;
    let calls = 0;
    const opts = {
      tool: "t",
      params: {},
      ttlMs: 10,
      budget: createCallBudget(5),
      cache,
      now: () => new Date(t),
      run: async () => ++calls,
    };
    await callTool(opts);
    t = 20;
    await callTool(opts);
    assert.equal(calls, 2);
  });
});
