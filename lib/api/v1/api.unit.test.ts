/**
 * Public API v1 — unit tests that need no database: the `apiRoute` pipeline
 * (keys, plan gating, scopes, rate limit, quota, validation, idempotency,
 * error shape, request log), the sliding window, cursors, briefing dedupe
 * rules, webhook URL checks / signing / delivery, and the OpenAPI contract.
 *
 * Usage: pnpm test:api:unit
 */

import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, test } from "node:test";
import { z } from "zod";
import { sameBriefingParams } from "@/lib/api/v1/briefingDedupe";
import { endpoints, type EndpointDef } from "@/lib/api/v1/contract";
import { createContractValidator } from "@/lib/api/v1/contractValidator";
import { decodeCursor, encodeCursor, pageFromRows } from "@/lib/api/v1/cursor";
import { ApiError, API_ERROR_CODES } from "@/lib/api/v1/errors";
import {
  apiRoute,
  setApiDeps,
  type ApiDeps,
  type ApiKeyRecord,
  type ApiRequestLogEntry,
} from "@/lib/api/v1/handler";
import { MemoryIdempotencyStore } from "@/lib/api/v1/idempotency";
import { generateApiKey } from "@/lib/api/v1/keys";
import { buildOpenApiDocument, errorExample, schemaExample } from "@/lib/api/v1/openapi";
import { MemoryRateLimiter, slidingWindowDecision } from "@/lib/api/v1/rateLimit";
import { errorBodySchema } from "@/lib/api/v1/schemas";
import {
  assertSafeWebhookUrl,
  isPrivateAddress,
  postWebhook,
  signWebhookPayload,
  verifyWebhookSignature,
} from "@/lib/api/v1/webhooks";
import type { PlanTier } from "@/lib/billing/plan";
import { normalizeNewsGenerationRequest } from "@/services/news/newsGenerationRequest";

// ── Fixtures ──

const T0 = new Date("2026-10-12T06:00:30.000Z");

type World = {
  deps: ApiDeps;
  plans: Map<string, PlanTier>;
  logs: ApiRequestLogEntry[];
  touches: string[];
  acceptedJobs: { count: number };
  clock: { now: Date };
  addKey(input?: Partial<ApiKeyRecord> & { userId?: string }): { token: string; record: ApiKeyRecord };
};

function makeWorld(): World {
  const keys = new Map<string, ApiKeyRecord>();
  const plans = new Map<string, PlanTier>();
  const logs: ApiRequestLogEntry[] = [];
  const touches: string[] = [];
  const acceptedJobs = { count: 0 };
  const clock = { now: T0 };

  const deps: ApiDeps = {
    now: () => clock.now,
    findApiKeyByHash: async (hash) => keys.get(hash) ?? null,
    getUserPlan: async (userId) => plans.get(userId) ?? "free",
    loadUser: async (userId) => ({ id: userId, clerkId: `clerk_${userId}`, email: `${userId}@example.com` }),
    rateLimiter: new MemoryRateLimiter(),
    countAcceptedPipelineJobs: async () => acceptedJobs.count,
    idempotency: new MemoryIdempotencyStore(),
    logRequest: async (entry) => void logs.push(entry),
    touchApiKeyLastUsed: async (id) => void touches.push(id),
  };

  let n = 0;
  return {
    deps,
    plans,
    logs,
    touches,
    acceptedJobs,
    clock,
    addKey(input = {}) {
      n += 1;
      const { key, prefix, hashedKey } = generateApiKey();
      const userId = input.userId ?? "user_1";
      if (!plans.has(userId)) plans.set(userId, "pro");
      const record: ApiKeyRecord = {
        id: `00000000-0000-4000-8000-00000000000${n}`,
        userId,
        name: `key ${n}`,
        prefix,
        scopes: ["news:read", "news:write"],
        createdAt: T0,
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
        ...input,
      };
      keys.set(hashedKey, record);
      return { token: key, record };
    },
  };
}

const okOutput = z.object({ ok: z.literal(true), userId: z.string() });

const readEndpoint = {
  method: "GET",
  path: "/things/{id}",
  operationId: "things.get",
  summary: "test",
  tags: ["Test"],
  scope: "news:read",
  costClass: "read",
  input: {
    params: z.strictObject({ id: z.uuid() }),
    query: z.strictObject({ limit: z.coerce.number().int().min(1).max(5).default(2) }),
  },
  output: okOutput,
  successStatus: 200,
  successDescription: "ok",
  errors: [],
} satisfies EndpointDef;

const writeEndpoint = {
  method: "POST",
  path: "/things",
  operationId: "things.create",
  summary: "test",
  tags: ["Test"],
  scope: "news:write",
  costClass: "pipeline",
  input: { body: z.strictObject({ name: z.string().min(1), count: z.number().int().max(12).default(1) }) },
  output: z.object({ id: z.string(), name: z.string(), count: z.number() }),
  successStatus: 202,
  successDescription: "accepted",
  idempotent: true,
  errors: [],
} satisfies EndpointDef;

const THING_ID = "11111111-1111-4111-8111-111111111111";

function call(
  handler: ReturnType<typeof apiRoute>,
  input: {
    method?: string;
    path?: string;
    token?: string | null;
    headers?: Record<string, string>;
    body?: string;
    params?: Record<string, string>;
  } = {},
) {
  const headers = new Headers(input.headers);
  if (input.token) headers.set("authorization", `Bearer ${input.token}`);
  const request = new Request(`http://localhost/api/v1${input.path ?? `/things/${THING_ID}`}`, {
    method: input.method ?? "GET",
    headers,
    body: input.body,
  });
  return handler(request, { params: Promise.resolve(input.params ?? { id: THING_ID }) });
}

async function errorOf(response: Response) {
  const body = (await response.json()) as z.infer<typeof errorBodySchema>;
  errorBodySchema.parse(body);
  return body.error;
}

const readHandler = apiRoute(readEndpoint, async (ctx) => ({ ok: true as const, userId: ctx.userId }));

let world: World;
beforeEach(() => {
  world = makeWorld();
  setApiDeps(world.deps);
  process.env.API_PRO_REQUESTS_PER_MINUTE = "1000";
  process.env.API_PRO_PIPELINE_JOBS_PER_DAY = "50";
});
afterEach(() => setApiDeps(null));

// ── Keys ──

describe("API keys", () => {
  test("missing, malformed, unknown, revoked and expired keys are 401", async () => {
    const valid = world.addKey();
    const revoked = world.addKey({ revokedAt: new Date("2026-10-01") });
    const expired = world.addKey({ expiresAt: new Date(T0.getTime() - 1) });
    const unknown = generateApiKey().key;

    for (const [token, message] of [
      [null, /Missing API key/],
      ["not-a-key", /Invalid API key/],
      [unknown, /Invalid API key/],
      [revoked.token, /revoked/],
      [expired.token, /expired/],
    ] as const) {
      const res = await call(readHandler, { token });
      assert.equal(res.status, 401, String(token));
      assert.match(res.headers.get("www-authenticate") ?? "", /Bearer/);
      const error = await errorOf(res);
      assert.equal(error.code, "unauthorized");
      assert.match(error.message, message);
    }
    const ok = await call(readHandler, { token: valid.token });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ok: true, userId: "user_1" });
  });

  test("a non-Bearer Authorization header is rejected", async () => {
    const { token } = world.addKey();
    const res = await call(readHandler, { headers: { authorization: `Basic ${token}` } });
    assert.equal(res.status, 401);
  });

  test("request id: well-formed client id is echoed, otherwise generated", async () => {
    const { token } = world.addKey();
    const echoed = await call(readHandler, { token, headers: { "x-request-id": "client-req-12345" } });
    assert.equal(echoed.headers.get("x-request-id"), "client-req-12345");
    const generated = await call(readHandler, { token, headers: { "x-request-id": "bad id!" } });
    assert.match(generated.headers.get("x-request-id") ?? "", /^req_[0-9a-f]{24}$/);
  });
});

// ── Plan gating ──

describe("plan gating", () => {
  test("free plan is 403 plan_required; downgrade and re-upgrade take effect immediately", async () => {
    const { token } = world.addKey();
    assert.equal((await call(readHandler, { token })).status, 200);

    world.plans.set("user_1", "free");
    const blocked = await call(readHandler, { token });
    assert.equal(blocked.status, 403);
    assert.equal((await errorOf(blocked)).code, "plan_required");

    world.plans.set("user_1", "pro");
    assert.equal((await call(readHandler, { token })).status, 200);
  });

  test("plan is checked before scope", async () => {
    const { token } = world.addKey({ scopes: [] });
    world.plans.set("user_1", "free");
    assert.equal((await errorOf(await call(readHandler, { token }))).code, "plan_required");
  });
});

// ── Scopes ──

describe("scopes", () => {
  test("missing scope is 403 forbidden with requiredScope", async () => {
    const { token } = world.addKey({ scopes: ["research:read"] });
    const res = await call(readHandler, { token });
    assert.equal(res.status, 403);
    const error = await errorOf(res);
    assert.equal(error.code, "forbidden");
    assert.deepEqual(error.details, { requiredScope: "news:read" });
  });
});

// ── Validation ──

describe("validation", () => {
  const writeHandler = apiRoute(writeEndpoint, async (ctx) => ctx.respond(202, { id: "t1", ...ctx.body }));

  test("unknown and invalid query params are 400 with field details", async () => {
    const { token } = world.addKey();
    const res = await call(readHandler, { token, path: `/things/${THING_ID}?limit=9&bogus=1` });
    assert.equal(res.status, 400);
    const error = await errorOf(res);
    assert.equal(error.code, "invalid_request");
    const fields = (error.details as { fields: { in: string; path: string }[] }).fields;
    assert.deepEqual(
      fields.map((f) => `${f.in}:${f.path}`).sort(),
      ["query:bogus", "query:limit"],
    );
  });

  test("malformed path id answers 404 (same as someone else's id)", async () => {
    const { token } = world.addKey();
    const res = await call(readHandler, { token, params: { id: "not-a-uuid" } });
    assert.equal(res.status, 404);
    assert.equal((await errorOf(res)).code, "not_found");
  });

  test("body: strict, defaults applied, JSON and content-type enforced, 64 KB cap", async () => {
    const { token } = world.addKey();
    const json = { "content-type": "application/json" };
    const post = (body: string, headers: Record<string, string> = json) =>
      call(writeHandler, { method: "POST", path: "/things", token, headers, body });

    const ok = await post(JSON.stringify({ name: "a" }));
    assert.equal(ok.status, 202);
    assert.deepEqual(await ok.json(), { id: "t1", name: "a", count: 1 });

    const extra = await errorOf(await post(JSON.stringify({ name: "a", email: "x@y.z" })));
    assert.equal(extra.code, "invalid_request");
    assert.match(JSON.stringify(extra.details), /"path":"email"/);

    assert.equal((await errorOf(await post("{not json"))).code, "invalid_request");
    assert.equal((await post(JSON.stringify({ name: "a" }), { "content-type": "text/plain" })).status, 415);

    const big = await post(JSON.stringify({ name: "x".repeat(70 * 1024) }));
    assert.equal(big.status, 413);
    assert.equal((await errorOf(big)).code, "payload_too_large");
  });
});

// ── Rate limit ──

describe("rate limit", () => {
  test("429 with Retry-After after the per-minute limit, X-RateLimit-* on every response", async () => {
    process.env.API_PRO_REQUESTS_PER_MINUTE = "3";
    const { token } = world.addKey();
    for (let i = 0; i < 3; i += 1) {
      const res = await call(readHandler, { token });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("x-ratelimit-limit"), "3");
      assert.equal(res.headers.get("x-ratelimit-remaining"), String(2 - i));
    }
    const limited = await call(readHandler, { token });
    assert.equal(limited.status, 429);
    assert.equal((await errorOf(limited)).code, "rate_limited");
    assert.ok(Number(limited.headers.get("retry-after")) >= 1);

    // Two windows later nothing from before counts.
    world.clock.now = new Date(T0.getTime() + 120_000);
    assert.equal((await call(readHandler, { token })).status, 200);
  });

  test("limits are per key", async () => {
    process.env.API_PRO_REQUESTS_PER_MINUTE = "1";
    const a = world.addKey();
    const b = world.addKey();
    assert.equal((await call(readHandler, { token: a.token })).status, 200);
    assert.equal((await call(readHandler, { token: a.token })).status, 429);
    assert.equal((await call(readHandler, { token: b.token })).status, 200);
  });

  test("sliding window weights the previous minute", () => {
    // 30s into the window: half of the previous minute's 10 still counts.
    const now = new Date("2026-10-12T06:00:30.000Z");
    assert.equal(slidingWindowDecision({ previous: 10, current: 5, limit: 10, now }).allowed, true);
    const denied = slidingWindowDecision({ previous: 10, current: 6, limit: 10, now });
    assert.equal(denied.allowed, false);
    // Allowed again once 10 * (1 - t/60) + 6 <= 10, i.e. at t = 36s → 6s from now.
    assert.equal(denied.retryAfterSeconds, 6);
    assert.equal(denied.resetAt.toISOString(), "2026-10-12T06:01:00.000Z");
  });
});

// ── Quota ──

describe("daily pipeline quota", () => {
  test("consumePipelineQuota answers 429 quota_exceeded at the limit, with Retry-After to UTC midnight", async () => {
    process.env.API_PRO_PIPELINE_JOBS_PER_DAY = "2";
    const { token } = world.addKey();
    const handler = apiRoute(writeEndpoint, async (ctx) => {
      await ctx.consumePipelineQuota();
      world.acceptedJobs.count += 1;
      return ctx.respond(202, { id: "t", ...ctx.body });
    });
    const post = () =>
      call(handler, {
        method: "POST",
        path: "/things",
        token,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "a" }),
      });

    assert.equal((await post()).status, 202);
    assert.equal((await post()).status, 202);
    const res = await post();
    assert.equal(res.status, 429);
    const error = await errorOf(res);
    assert.equal(error.code, "quota_exceeded");
    assert.deepEqual(error.details, { limit: 2, used: 2, resetsAt: "2026-10-13T00:00:00.000Z" });
    assert.equal(res.headers.get("retry-after"), String(24 * 3600 - 6 * 3600 - 30));
  });

  test("a handler that doesn't accept a job (e.g. dedupe) never touches the quota", async () => {
    process.env.API_PRO_PIPELINE_JOBS_PER_DAY = "1";
    world.acceptedJobs.count = 1;
    const { token } = world.addKey();
    const handler = apiRoute(writeEndpoint, async (ctx) => ctx.respond(202, { id: "existing", ...ctx.body }));
    const res = await call(handler, {
      method: "POST",
      path: "/things",
      token,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "a" }),
    });
    assert.equal(res.status, 202);
  });
});

// ── Idempotency ──

describe("Idempotency-Key", () => {
  test("replay, mismatch, in-progress, and errors are not stored", async () => {
    const { token } = world.addKey();
    let runs = 0;
    let fail: "none" | "500" | "400" = "none";
    let release: (() => void) | null = null;
    const handler = apiRoute(writeEndpoint, async (ctx) => {
      runs += 1;
      if (release) await new Promise<void>((resolve) => (release = resolve));
      if (fail === "500") throw new Error("boom");
      if (fail === "400") throw new ApiError("invalid_request", "nope");
      return ctx.respond(202, { id: `job_${runs}`, ...ctx.body });
    });
    const post = (key: string, body: object) =>
      call(handler, {
        method: "POST",
        path: "/things",
        token,
        headers: { "content-type": "application/json", "idempotency-key": key },
        body: JSON.stringify(body),
      });

    const first = await post("k1", { name: "a", count: 1 });
    assert.equal(first.status, 202);
    const firstBody = await first.json();

    // Same key, same body (keys reordered) → replay without running again.
    const replay = await post("k1", { count: 1, name: "a" });
    assert.equal(replay.status, 202);
    assert.equal(replay.headers.get("idempotent-replayed"), "true");
    assert.deepEqual(await replay.json(), firstBody);
    assert.equal(runs, 1);

    // Same key, different body → 422.
    const mismatch = await post("k1", { name: "b" });
    assert.equal(mismatch.status, 422);
    assert.equal((await errorOf(mismatch)).code, "idempotency_key_reused");

    // 500 and 4xx are not stored: the same key runs again.
    fail = "500";
    const crashed = await post("k2", { name: "a" });
    assert.equal(crashed.status, 500);
    fail = "400";
    assert.equal((await post("k2", { name: "a" })).status, 400);
    fail = "none";
    assert.equal((await post("k2", { name: "a" })).status, 202);
    assert.equal(runs, 4);

    // While the first request with a key is running, the second gets 409.
    release = () => undefined;
    const slow = post("k3", { name: "a" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const concurrent = await post("k3", { name: "a" });
    assert.equal(concurrent.status, 409);
    assert.equal((await errorOf(concurrent)).code, "conflict");
    (release as unknown as () => void)();
    assert.equal((await slow).status, 202);

    const invalid = await post(" ", { name: "a" });
    assert.equal(invalid.status, 400);
  });

  test("keys expire after 24h", async () => {
    const store = new MemoryIdempotencyStore();
    const scope = { userId: "u", key: "k", method: "POST", path: "/p", requestHash: "h1" };
    assert.equal((await store.begin(scope, T0)).kind, "new");
    await store.complete("u", "k", 202, { a: 1 });
    assert.equal((await store.begin({ ...scope, requestHash: "h2" }, T0)).kind, "mismatch");
    const later = new Date(T0.getTime() + 24 * 3600 * 1000);
    assert.equal((await store.begin({ ...scope, requestHash: "h2" }, later)).kind, "new");
  });
});

// ── Errors, output DTOs, logging ──

describe("errors and responses", () => {
  test("500 never leaks the underlying error", async () => {
    const { token } = world.addKey();
    const handler = apiRoute(readEndpoint, async () => {
      throw new Error("connect ECONNREFUSED postgres://admin:hunter2@db");
    });
    const originalError = console.error;
    console.error = () => undefined;
    try {
      const res = await call(handler, { token });
      assert.equal(res.status, 500);
      const text = await res.text();
      assert.doesNotMatch(text, /hunter2|ECONNREFUSED|postgres/);
      const body = JSON.parse(text) as z.infer<typeof errorBodySchema>;
      assert.equal(body.error.code, "internal_error");
      assert.equal(body.error.requestId, res.headers.get("x-request-id"));
    } finally {
      console.error = originalError;
    }
  });

  test("output is parsed: unknown fields are stripped, a wrong shape is a 500", async () => {
    const { token } = world.addKey();
    const leaky = apiRoute(readEndpoint, async () =>
      ({ ok: true, userId: "u", hashedKey: "secret" }) as unknown as { ok: true; userId: string },
    );
    const res = await call(leaky, { token });
    assert.deepEqual(await res.json(), { ok: true, userId: "u" });

    const wrong = apiRoute(readEndpoint, async () => ({ nope: 1 }) as unknown as { ok: true; userId: string });
    const originalError = console.error;
    console.error = () => undefined;
    try {
      assert.equal((await call(wrong, { token })).status, 500);
    } finally {
      console.error = originalError;
    }
  });

  test("every authenticated request is logged; lastUsedAt is touched at most once a minute", async () => {
    const { token, record } = world.addKey();
    await call(readHandler, { token });
    await call(readHandler, { token, params: { id: "bad" } });
    assert.deepEqual(
      world.logs.map((l) => [l.status, l.costClass, l.apiKeyId]),
      [
        [200, "read", record.id],
        [404, "read", record.id],
      ],
    );
    assert.equal(world.touches.length, 2); // lastUsedAt was null both times in this fake
    record.lastUsedAt = new Date(T0.getTime() - 30_000);
    await call(readHandler, { token });
    assert.equal(world.touches.length, 2);
    record.lastUsedAt = new Date(T0.getTime() - 61_000);
    await call(readHandler, { token });
    assert.equal(world.touches.length, 3);

    await call(readHandler, { token: null });
    assert.equal(world.logs.length, 4, "requests without a valid key are not logged");
  });
});

// ── Cursors ──

describe("cursors", () => {
  test("round-trip, nulls, garbage", () => {
    const at = new Date("2026-10-12T05:23:23.000Z");
    assert.deepEqual(decodeCursor(encodeCursor({ t: at, id: "abc" })), { t: at, id: "abc" });
    assert.deepEqual(decodeCursor(encodeCursor({ t: null, id: "abc" })), { t: null, id: "abc" });
    assert.equal(decodeCursor(undefined), null);
    assert.throws(() => decodeCursor("garbage"), (e: unknown) => e instanceof ApiError && e.status === 400);
  });

  test("pageFromRows only sets nextCursor when there is another row", () => {
    const rows = [1, 2, 3].map((i) => ({ id: `r${i}`, at: new Date(Date.UTC(2026, 9, i)) }));
    assert.equal(pageFromRows(rows.slice(0, 2), 2, (r) => r.at).nextCursor, null);
    const page = pageFromRows(rows, 2, (r) => r.at);
    assert.deepEqual(page.items.map((r) => r.id), ["r1", "r2"]);
    assert.deepEqual(decodeCursor(page.nextCursor!), { t: rows[1]!.at, id: "r2" });
  });
});

// ── Briefing dedupe rules ──

describe("briefing dedupe", () => {
  const base = { date: "2026-10-12", scope: "world" as const, storyCount: 5 };
  const norm = (extra: object) => normalizeNewsGenerationRequest({ ...base, ...extra });

  test("same parameters (order, case, defaults) are equal", () => {
    assert.ok(
      sameBriefingParams(
        norm({ categories: ["Markets", "economy"], language: "english", sources: ["https://www.livemint.com/x"] }),
        norm({ categories: ["economy", "markets"], language: "English", sources: ["livemint.com"] }),
        false,
      ),
    );
    assert.ok(sameBriefingParams(norm({}), norm({ storyCount: 5, language: "English" }), false));
  });

  test("any different parameter is a conflict", () => {
    for (const extra of [{ storyCount: 6 }, { categories: ["markets"] }, { customQuery: "rbi" }, { language: "Hindi" }, { sources: ["a.com"] }]) {
      assert.equal(sameBriefingParams(norm(extra), norm({}), false), false, JSON.stringify(extra));
    }
  });

  test("coordinates only count when the client sent them", () => {
    const local = { scope: "local" as const, location: "Hyderabad" };
    const stored = norm({ ...local, latitude: 17.4, longitude: 78.5 });
    assert.ok(sameBriefingParams(norm(local), stored, false));
    assert.equal(sameBriefingParams(norm({ ...local, latitude: 1, longitude: 2 }), stored, true), false);
  });
});

// ── Webhooks ──

describe("webhooks", () => {
  test("private, loopback, link-local, CGNAT and mapped addresses are blocked", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "not-an-ip"]) {
      assert.equal(isPrivateAddress(ip), true, ip);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
      assert.equal(isPrivateAddress(ip), false, ip);
    }
  });

  test("webhook URLs must be https on public hosts", async () => {
    for (const url of ["http://example.com/hook", "https://127.0.0.1/hook", "https://[::1]/x", "https://localhost/x", "https://user:pw@8.8.8.8/x", "nope"]) {
      await assert.rejects(assertSafeWebhookUrl(url), (e: unknown) => e instanceof ApiError && e.code === "invalid_request", url);
    }
    assert.equal((await assertSafeWebhookUrl("https://8.8.8.8/hook")).hostname, "8.8.8.8");
  });

  test("signature verifies, and rejects tampering, wrong secret and stale timestamps", () => {
    const body = JSON.stringify({ id: "j", type: "job.succeeded" });
    const sig = signWebhookPayload("whsec_test", 1_791_700_000, body);
    assert.match(sig, /^v1=[0-9a-f]{64}$/);
    const ok = { secret: "whsec_test", timestamp: "1791700000", body, signature: sig, nowSeconds: 1_791_700_100 };
    assert.equal(verifyWebhookSignature(ok), true);
    assert.equal(verifyWebhookSignature({ ...ok, body: `${body} ` }), false);
    assert.equal(verifyWebhookSignature({ ...ok, secret: "whsec_other" }), false);
    assert.equal(verifyWebhookSignature({ ...ok, nowSeconds: 1_791_700_000 + 301 }), false);
  });

  test("delivery POSTs a signed body; non-2xx fails", async () => {
    const received: { headers: IncomingMessage["headers"]; body: string }[] = [];
    let status = 204;
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({ headers: req.headers, body });
        res.statusCode = status;
        res.end();
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
    process.env.API_WEBHOOK_ALLOW_PRIVATE = "true";
    try {
      const now = new Date("2026-10-12T06:00:00.000Z");
      const payload = { id: "job_1", type: "job.succeeded" };
      assert.deepEqual(
        await postWebhook({ url, secret: "whsec_x", deliveryId: "job_1", event: "job.succeeded", payload, now }),
        { status: 204 },
      );
      const [hit] = received;
      assert.equal(hit!.headers["x-ds-event"], "job.succeeded");
      assert.equal(hit!.headers["x-ds-delivery"], "job_1");
      assert.equal(hit!.headers["x-ds-timestamp"], String(now.getTime() / 1000));
      assert.equal(
        verifyWebhookSignature({
          secret: "whsec_x",
          timestamp: String(hit!.headers["x-ds-timestamp"]),
          body: hit!.body,
          signature: String(hit!.headers["x-ds-signature"]),
          nowSeconds: now.getTime() / 1000,
        }),
        true,
      );
      assert.deepEqual(JSON.parse(hit!.body), payload);

      status = 500;
      await assert.rejects(postWebhook({ url, secret: "s", deliveryId: "j", event: "job.failed", payload }), /HTTP 500/);
    } finally {
      delete process.env.API_WEBHOOK_ALLOW_PRIVATE;
      server.close();
    }
  });
});

// ── OpenAPI contract ──

describe("OpenAPI contract", () => {
  const doc = buildOpenApiDocument("https://example.com") as {
    openapi: string;
    paths: Record<string, Record<string, { operationId: string; responses: Record<string, { content?: Record<string, { example?: unknown; examples?: Record<string, { value: unknown }> }> }> }>>;
  };
  const validateResponse = createContractValidator();

  test("is OpenAPI 3.1 with unique operationIds", () => {
    assert.equal(doc.openapi, "3.1.0");
    const ids = Object.values(doc.paths).flatMap((item) => Object.values(item).map((op) => op.operationId));
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(
      ids.sort(),
      Object.values(endpoints).map((e) => e.operationId).sort(),
    );
  });

  test("every example validates against its OpenAPI schema and its zod schema", () => {
    for (const [path, item] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(item)) {
        for (const [status, response] of Object.entries(op.responses)) {
          const media = response.content?.["application/json"];
          assert.ok(media, `${method} ${path} ${status} has a body`);
          const examples = media.example !== undefined ? [media.example] : Object.values(media.examples ?? {}).map((e) => e.value);
          assert.ok(examples.length > 0, `${method} ${path} ${status} has an example`);
          for (const example of examples) {
            assert.equal(validateResponse(method, path, Number(status), example), null, op.operationId);
          }
        }
      }
    }
  });

  test("the validator rejects bodies that break the contract", () => {
    assert.notEqual(validateResponse("GET", "/me", 200, {}), null);
    assert.notEqual(validateResponse("GET", "/stories", 200, { data: [{ id: 1 }], nextCursor: null }), null);
    assert.notEqual(validateResponse("GET", "/stories", 401, { error: { code: "nope", message: "x", requestId: "r" } }), null);
    assert.equal(validateResponse("GET", "/stories", 401, errorExample("unauthorized")), null);
  });

    test("every error code has a valid example; every zod output example parses", () => {
    for (const code of API_ERROR_CODES) {
      errorBodySchema.parse(errorExample(code));
    }
    for (const endpoint of Object.values(endpoints) as EndpointDef[]) {
      const example = schemaExample(endpoint.output);
      assert.ok(example !== undefined, `${endpoint.operationId} output example`);
      endpoint.output.parse(example);
      if (endpoint.input.body) {
        endpoint.input.body.parse(schemaExample(endpoint.input.body));
      }
    }
  });
});
