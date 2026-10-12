/**
 * Public API v1 — integration tests through the real route handlers and the
 * database in DATABASE_URL (dev), like the newsletter lifecycle tests. All
 * fixtures belong to throwaway users deleted at the end (keys, logs, jobs,
 * briefings, research, newsletters and secrets cascade).
 *
 * Pipelines are mocked: the Inngest client records events instead of sending
 * them, and `after()` runs its callback in-process, so no LLM, SerpApi or
 * email is ever used. Pipeline completion is simulated by updating the
 * briefing / research row. Every response is validated against the OpenAPI
 * document (contract tests).
 *
 * Usage: pnpm test:api   (runs the unit tests too)
 */

import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after as afterAll, before, describe, mock, test } from "node:test";

// ── Mocks (before any app module loads) ──

type SentEvent = { name: string; data: Record<string, unknown> };
const sentEvents: SentEvent[] = [];
const fakeInngest = {
  send: async (event: SentEvent | SentEvent[]) => {
    const list = Array.isArray(event) ? event : [event];
    sentEvents.push(...list);
    return { ids: list.map(() => randomUUID()) };
  },
  createFunction: (config: unknown) => ({ config }),
};
mock.module("@/clients/inngestClient", {
  namedExports: {
    inngest: fakeInngest,
    inngestClient: { client: fakeInngest, send: fakeInngest.send, createFunction: fakeInngest.createFunction, serve: () => ({}) },
    createInngestClient: () => ({ client: fakeInngest }),
  },
});

const actualNextServer = await import("next/server");
const pendingAfter: Promise<unknown>[] = [];
mock.module("next/server", {
  namedExports: {
    ...actualNextServer,
    after: (task: (() => unknown) | Promise<unknown>) => {
      pendingAfter.push(Promise.resolve().then(() => (typeof task === "function" ? task() : task)));
    },
  },
});

process.env.API_PLAN_CACHE_TTL_MS = "0";
process.env.API_PRO_REQUESTS_PER_MINUTE = "10000";
process.env.API_PRO_PIPELINE_JOBS_PER_DAY = "50";

const { prisma } = await import("@/db");
const { generateApiKey } = await import("@/lib/api/v1/keys");
const { API_SCOPES } = await import("@/lib/api/v1/scopes");
const { endpoints } = await import("@/lib/api/v1/contract");
const { createContractValidator } = await import("@/lib/api/v1/contractValidator");
const { API_JOB_WEBHOOK_EVENT } = await import("@/lib/api/v1/jobs");
const { deliverJobWebhook, isJobReadyForWebhook } = await import("@/lib/api/v1/jobWebhook");
const { PostgresRateLimiter } = await import("@/lib/api/v1/rateLimit");
const { verifyWebhookSignature } = await import("@/lib/api/v1/webhooks");
const { MAX_NEWSLETTERS_PER_USER } = await import("@/lib/newsletter/constants");

const routes = {
  me: await import("@/app/api/v1/me/route"),
  stories: await import("@/app/api/v1/stories/route"),
  story: await import("@/app/api/v1/stories/[id]/route"),
  instruments: await import("@/app/api/v1/instruments/search/route"),
  briefings: await import("@/app/api/v1/news/briefings/route"),
  briefing: await import("@/app/api/v1/news/briefings/[id]/route"),
  reports: await import("@/app/api/v1/research/reports/route"),
  report: await import("@/app/api/v1/research/reports/[id]/route"),
  jobs: await import("@/app/api/v1/jobs/[id]/route"),
  newsletters: await import("@/app/api/v1/newsletters/route"),
  newsletter: await import("@/app/api/v1/newsletters/[id]/route"),
  pause: await import("@/app/api/v1/newsletters/[id]/pause/route"),
  resume: await import("@/app/api/v1/newsletters/[id]/resume/route"),
};

// ── Helpers ──

type EndpointName = keyof typeof endpoints;
type RouteHandler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

const HANDLERS: Record<EndpointName, RouteHandler> = {
  me: routes.me.GET,
  listStories: routes.stories.GET,
  getStory: routes.story.GET,
  searchInstruments: routes.instruments.GET,
  listBriefings: routes.briefings.GET,
  createBriefing: routes.briefings.POST,
  getBriefing: routes.briefing.GET,
  listResearch: routes.reports.GET,
  createResearch: routes.reports.POST,
  getResearch: routes.report.GET,
  getJob: routes.jobs.GET,
  listNewsletters: routes.newsletters.GET,
  createNewsletter: routes.newsletters.POST,
  getNewsletter: routes.newsletter.GET,
  updateNewsletter: routes.newsletter.PATCH,
  deleteNewsletter: routes.newsletter.DELETE,
  pauseNewsletter: routes.pause.POST,
  resumeNewsletter: routes.resume.POST,
};

const validateContract = createContractValidator();
const contractViolations: string[] = [];

type Call = {
  token: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
};

/** Calls an endpoint's route handler and checks the response against the OpenAPI document. */
async function call(name: EndpointName, input: Call): Promise<{ status: number; // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test responses are checked against the contract
  body: any; headers: Headers }> {
  const endpoint = endpoints[name];
  const path = endpoint.path.replace(/\{(\w+)\}/g, (_, key: string) => encodeURIComponent(input.params?.[key] ?? ""));
  const url = new URL(`http://localhost/api/v1${path}`);
  for (const [k, v] of Object.entries(input.query ?? {})) url.searchParams.set(k, v);
  const headers = new Headers({ authorization: `Bearer ${input.token}`, ...input.headers });
  if (input.body !== undefined) headers.set("content-type", "application/json");
  const response = await HANDLERS[name](
    new Request(url, {
      method: endpoint.method,
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    }),
    { params: Promise.resolve(input.params ?? {}) },
  );
  const body = await response.json();
  const violation = validateContract(endpoint.method, endpoint.path, response.status, body);
  if (violation) contractViolations.push(violation);
  return { status: response.status, body, headers: response.headers };
}

const userIds: string[] = [];

async function createUser(label: string, opts: { plan?: "PRO" | "FREE" } = {}) {
  const tag = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      clerkId: `test_api_${label}_${tag}`,
      email: `api-test-${label}-${tag}@example.test`,
      plan: opts.plan ?? "PRO",
    },
  });
  userIds.push(user.id);
  return user;
}

async function createKey(userId: string, scopes: string[] = [...API_SCOPES]) {
  const { key, prefix, hashedKey } = generateApiKey();
  const row = await prisma.apiKey.create({
    data: { userId, name: "integration test", prefix, hashedKey, scopes },
  });
  return { token: key, id: row.id };
}

function eventsNamed(name: string) {
  return sentEvents.filter((e) => e.name === name);
}

const RELIANCE = "NSE_EQ|INE002A01018";

let alice: Awaited<ReturnType<typeof createUser>>;
let bob: Awaited<ReturnType<typeof createUser>>;
let aliceKey: { token: string; id: string };
let bobKey: { token: string; id: string };

before(async () => {
  alice = await createUser("alice");
  bob = await createUser("bob");
  aliceKey = await createKey(alice.id);
  bobKey = await createKey(bob.id);
});

afterAll(async () => {
  await Promise.allSettled(pendingAfter);
  const keyIds = (await prisma.apiKey.findMany({ where: { userId: { in: userIds } }, select: { id: true } })).map((k) => k.id);
  await prisma.apiRateLimitWindow.deleteMany({ where: { bucket: { in: keyIds.map((id) => `key:${id}`) } } });
  await prisma.apiRateLimitWindow.deleteMany({ where: { bucket: { startsWith: "test:" } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

// ── Tests ──

describe("sync endpoints", () => {
  test("GET /me reflects the key and today's quota", async () => {
    const res = await call("me", { token: aliceKey.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, alice.email);
    assert.equal(res.body.apiKey.id, aliceKey.id);
    assert.equal(res.body.usage.pipelineJobsToday, 0);
  });

  test("stories: list, filters, cursor pagination, detail, 404", async () => {
    const page1 = await call("listStories", { token: aliceKey.token, query: { limit: "2" } });
    assert.equal(page1.status, 200);
    if (page1.body.data.length < 2 || !page1.body.nextCursor) return; // empty dev DB: nothing more to check
    const page2 = await call("listStories", { token: aliceKey.token, query: { limit: "2", cursor: page1.body.nextCursor } });
    assert.equal(page2.status, 200);
    const ids1 = page1.body.data.map((s: { id: string }) => s.id);
    for (const story of page2.body.data) assert.ok(!ids1.includes(story.id), "pages don't overlap");
    const last = page1.body.data[1];
    for (const story of page2.body.data) {
      assert.ok(story.publishedAt === null || last.publishedAt === null || story.publishedAt <= last.publishedAt);
    }

    const world = await call("listStories", { token: aliceKey.token, query: { region: "world", limit: "50" } });
    for (const story of world.body.data) assert.ok(["world", "both"].includes(story.region));

    const detail = await call("getStory", { token: aliceKey.token, params: { id: ids1[0] } });
    assert.equal(detail.status, 200);
    assert.equal(typeof detail.body.content, "string");

    assert.equal((await call("getStory", { token: aliceKey.token, params: { id: randomUUID() } })).status, 404);
  });

  test("instrument search", async () => {
    const res = await call("searchInstruments", { token: aliceKey.token, query: { q: "reliance", limit: "3" } });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length <= 3);
  });
});

describe("plan gating", () => {
  test("downgrade → 403 plan_required; lapsed subscription → 403; re-upgrade → 200", async () => {
    const carol = await createUser("carol");
    const key = await createKey(carol.id);
    assert.equal((await call("me", { token: key.token })).status, 200);

    await prisma.user.update({ where: { id: carol.id }, data: { plan: "FREE" } });
    const downgraded = await call("me", { token: key.token });
    assert.equal(downgraded.status, 403);
    assert.equal(downgraded.body.error.code, "plan_required");

    // Still PRO on the user row, but the period ended beyond the grace window
    // (and nothing ran the lazy web-only reconcile).
    await prisma.user.update({ where: { id: carol.id }, data: { plan: "PRO" } });
    await prisma.subscription.create({
      data: {
        userId: carol.id,
        plan: "PRO",
        provider: "test",
        currentPeriodEnd: new Date(Date.now() - 30 * 24 * 3600 * 1000),
      },
    });
    assert.equal((await call("me", { token: key.token })).body.error.code, "plan_required");

    await prisma.subscription.update({
      where: { userId: carol.id },
      data: { currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000) },
    });
    assert.equal((await call("me", { token: key.token })).status, 200);
  });

  test("a key without the scope gets 403 forbidden", async () => {
    const key = await createKey(alice.id, ["news:read"]);
    const res = await call("listResearch", { token: key.token });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.details.requiredScope, "research:read");
  });
});

describe("async briefings", () => {
  const date = "2026-10-01";
  let jobId: string;
  let briefingId: string;

  test("POST → 202 job, pipeline enqueued with an api trace, no real pipeline", async () => {
    const before = sentEvents.length;
    const res = await call("createBriefing", {
      token: aliceKey.token,
      headers: { "x-request-id": "integration-brief-1" },
      body: { date, scope: "world", storyCount: 4, categories: ["markets"] },
    });
    assert.equal(res.status, 202);
    assert.equal(res.body.status, "pending");
    assert.equal(res.body.deduplicated, false);
    assert.match(res.headers.get("location") ?? "", new RegExp(`/api/v1/jobs/${res.body.id}$`));
    jobId = res.body.id;
    briefingId = res.body.resource.id;

    const [event] = sentEvents.slice(before).filter((e) => e.data.newsRequestId === briefingId);
    assert.ok(event, "news pipeline event sent");
    const trace = event!.data.trace as { tags: string[]; metadata: Record<string, unknown> };
    assert.ok(trace.tags.includes("source:api"));
    assert.equal(trace.metadata.source, "api");
    assert.equal(trace.metadata.apiKeyId, aliceKey.id);
    assert.equal(trace.metadata.requestId, "integration-brief-1");
    assert.equal(trace.metadata.plan, "pro");
  });

  test("same parameters → 200 with the existing job, deduplicated, no quota", async () => {
    const res = await call("createBriefing", {
      token: aliceKey.token,
      body: { date, scope: "world", storyCount: 4, categories: ["Markets"] },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.id, jobId);
    assert.equal(res.body.deduplicated, true);
    assert.equal((await call("me", { token: aliceKey.token })).body.usage.pipelineJobsToday, 1);
  });

  test("same slot, different parameters → 409 with the existing id", async () => {
    const res = await call("createBriefing", {
      token: aliceKey.token,
      body: { date, scope: "world", storyCount: 6 },
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, "conflict");
    assert.equal(res.body.error.details.existingBriefingId, briefingId);
  });

  test("storyCount is limited to 1–12", async () => {
    for (const storyCount of [0, 13]) {
      const res = await call("createBriefing", { token: aliceKey.token, body: { date: "2026-10-02", scope: "world", storyCount } });
      assert.equal(res.status, 400);
    }
  });

  test("job status is read live from the briefing", async () => {
    assert.equal((await call("getJob", { token: aliceKey.token, params: { id: jobId } })).body.status, "pending");
    await prisma.newsRequest.update({
      where: { id: briefingId },
      data: { status: "success", completedAt: new Date("2026-10-01T06:00:00Z") },
    });
    const job = await call("getJob", { token: aliceKey.token, params: { id: jobId } });
    assert.equal(job.body.status, "succeeded");
    assert.equal(job.body.completedAt, "2026-10-01T06:00:00.000Z");

    const briefing = await call("getBriefing", { token: aliceKey.token, params: { id: briefingId } });
    assert.equal(briefing.status, 200);
    assert.equal(briefing.body.status, "succeeded");
    assert.deepEqual(briefing.body.categories, ["markets"]);

    const list = await call("listBriefings", { token: aliceKey.token, query: { status: "succeeded" } });
    assert.ok(list.body.data.some((b: { id: string }) => b.id === briefingId));
  });

  test("a failed briefing is retried as a new, quota-counted job", async () => {
    await prisma.newsRequest.update({ where: { id: briefingId }, data: { status: "failed" } });
    const res = await call("createBriefing", { token: aliceKey.token, body: { date, scope: "world", storyCount: 5 } });
    assert.equal(res.status, 202);
    assert.equal(res.body.resource.id, briefingId);
    assert.notEqual(res.body.id, jobId);
  });
});

describe("async research", () => {
  let jobId: string;
  let reportId: string;

  test("POST → 202, pipeline enqueued after the response with an api trace", async () => {
    const res = await call("createResearch", {
      token: aliceKey.token,
      body: { instrumentKey: RELIANCE, prompt: "How are the latest results?" },
    });
    assert.equal(res.status, 202);
    jobId = res.body.id;
    reportId = res.body.resource.id;
    assert.equal(res.body.type, "research");

    await Promise.all(pendingAfter);
    const event = sentEvents.find((e) => e.data.stockResearchId === reportId);
    assert.ok(event, "stock research event sent");
    const trace = event!.data.trace as { metadata: Record<string, unknown> };
    assert.equal(trace.metadata.source, "api");
    assert.equal(trace.metadata.apiKeyId, aliceKey.id);
  });

  test("unknown or mismatched instrument → 400, no job", async () => {
    const jobs = await prisma.apiJob.count({ where: { userId: alice.id } });
    const unknown = await call("createResearch", { token: aliceKey.token, body: { instrumentKey: "NSE_EQ|NOPE", prompt: "hello there" } });
    assert.equal(unknown.status, 400);
    const mismatch = await call("createResearch", {
      token: aliceKey.token,
      body: { assetType: "ETF", instrumentKey: RELIANCE, prompt: "hello there" },
    });
    assert.equal(mismatch.status, 400);
    assert.equal(await prisma.apiJob.count({ where: { userId: alice.id } }), jobs);
  });

  test("status running → succeeded, report readable", async () => {
    await prisma.stockResearch.update({ where: { id: reportId }, data: { status: "RUNNING", startedAt: new Date() } });
    assert.equal((await call("getJob", { token: aliceKey.token, params: { id: jobId } })).body.status, "running");
    await prisma.stockResearch.update({
      where: { id: reportId },
      data: { status: "COMPLETED", completedAt: new Date(), reportMarkdown: "# Report" },
    });
    const report = await call("getResearch", { token: aliceKey.token, params: { id: reportId } });
    assert.equal(report.body.status, "succeeded");
    assert.equal(report.body.reportMarkdown, "# Report");
    const list = await call("listResearch", { token: aliceKey.token, query: { status: "succeeded", limit: "5" } });
    assert.ok(list.body.data.some((r: { id: string }) => r.id === reportId));
  });

  test("Idempotency-Key replays the job; a different body is 422", async () => {
    const body = { instrumentKey: RELIANCE, prompt: "Idempotent research please" };
    const headers = { "idempotency-key": `it-${randomUUID()}` };
    const first = await call("createResearch", { token: aliceKey.token, body, headers });
    const second = await call("createResearch", { token: aliceKey.token, body, headers });
    assert.equal(first.status, 202);
    assert.equal(second.status, 202);
    assert.equal(second.headers.get("idempotent-replayed"), "true");
    assert.equal(second.body.id, first.body.id);
    assert.equal(await prisma.stockResearch.count({ where: { userId: alice.id, userPrompt: body.prompt } }), 1);

    const reused = await call("createResearch", { token: aliceKey.token, body: { ...body, prompt: "Something else" }, headers });
    assert.equal(reused.status, 422);
  });
});

describe("ownership", () => {
  test("another user's briefing, report, job and newsletter are 404", async () => {
    const briefing = await call("createBriefing", { token: aliceKey.token, body: { date: "2026-09-30", scope: "world" } });
    const report = await call("createResearch", { token: aliceKey.token, body: { instrumentKey: RELIANCE, prompt: "Ownership check" } });
    const newsletter = await call("createNewsletter", {
      token: aliceKey.token,
      body: { name: "Alice digest", scope: "world", storyCount: 3, frequency: "DAILY", sendTimeLocal: "07:00", timezone: "Asia/Kolkata" },
    });
    await call("pauseNewsletter", { token: aliceKey.token, params: { id: newsletter.body.id } });

    const as = (name: EndpointName, id: string, extra: Partial<Call> = {}) => call(name, { token: bobKey.token, params: { id }, ...extra });
    assert.equal((await as("getBriefing", briefing.body.resource.id)).status, 404);
    assert.equal((await as("getJob", briefing.body.id)).status, 404);
    assert.equal((await as("getResearch", report.body.resource.id)).status, 404);
    assert.equal((await as("getJob", report.body.id)).status, 404);
    assert.equal((await as("getNewsletter", newsletter.body.id)).status, 404);
    assert.equal((await as("updateNewsletter", newsletter.body.id, { body: { name: "mine now" } })).status, 404);
    assert.equal((await as("resumeNewsletter", newsletter.body.id)).status, 404);
    assert.equal((await as("deleteNewsletter", newsletter.body.id)).status, 404);
    assert.ok(await prisma.newsletter.findUnique({ where: { id: newsletter.body.id } }), "still there");

    const bobsList = await call("listBriefings", { token: bobKey.token });
    assert.equal(bobsList.body.data.length, 0);
  });
});

describe("newsletters", () => {
  test("email is always the primary email; CRUD, pause/resume; cap shared with the web app", async () => {
    const dave = await createUser("dave");
    const key = await createKey(dave.id);
    const body = { name: "Weekly", scope: "world", storyCount: 5, frequency: "WEEKLY", dayOfWeek: 1, sendTimeLocal: "08:00", timezone: "Asia/Kolkata" };

    const withEmail = await call("createNewsletter", { token: key.token, body: { ...body, email: "elsewhere@example.test" } });
    assert.equal(withEmail.status, 400);

    const created = await call("createNewsletter", { token: key.token, body });
    assert.equal(created.status, 201);
    assert.equal(created.body.email, dave.email);
    const id = created.body.id;

    const paused = await call("pauseNewsletter", { token: key.token, params: { id } });
    assert.equal(paused.body.isActive, false);
    assert.equal(paused.body.nextRunAt, null);
    const resumed = await call("resumeNewsletter", { token: key.token, params: { id } });
    assert.equal(resumed.body.isActive, true);
    assert.ok(resumed.body.nextRunAt);
    await call("pauseNewsletter", { token: key.token, params: { id } });

    const invalid = await call("updateNewsletter", { token: key.token, params: { id }, body: { frequency: "MONTHLY" } });
    assert.equal(invalid.status, 400);
    const updated = await call("updateNewsletter", { token: key.token, params: { id }, body: { storyCount: 7 } });
    assert.equal(updated.body.storyCount, 7);

    // Fill up to the per-user cap (newsletters made on the web count too).
    for (let i = 1; i < MAX_NEWSLETTERS_PER_USER; i += 1) {
      const res = await call("createNewsletter", { token: key.token, body: { ...body, name: `n${i}` } });
      assert.equal(res.status, 201);
      await call("pauseNewsletter", { token: key.token, params: { id: res.body.id } });
    }
    const over = await call("createNewsletter", { token: key.token, body });
    assert.equal(over.status, 409);
    assert.equal(over.body.error.code, "limit_reached");

    assert.equal((await call("listNewsletters", { token: key.token })).body.data.length, MAX_NEWSLETTERS_PER_USER);
    assert.equal((await call("deleteNewsletter", { token: key.token, params: { id } })).status, 200);
    assert.equal((await call("getNewsletter", { token: key.token, params: { id } })).status, 404);
  });
});

describe("quota and rate limit", () => {
  test("accepted jobs count toward the daily quota; deduplicated ones don't", async () => {
    const erin = await createUser("erin");
    const key = await createKey(erin.id);
    process.env.API_PRO_PIPELINE_JOBS_PER_DAY = "2";
    try {
      assert.equal((await call("createBriefing", { token: key.token, body: { date: "2026-10-03", scope: "world" } })).status, 202);
      assert.equal((await call("createResearch", { token: key.token, body: { instrumentKey: RELIANCE, prompt: "Quota one" } })).status, 202);

      const over = await call("createResearch", { token: key.token, body: { instrumentKey: RELIANCE, prompt: "Quota two" } });
      assert.equal(over.status, 429);
      assert.equal(over.body.error.code, "quota_exceeded");
      assert.ok(Number(over.headers.get("retry-after")) > 0);

      // Deduplicated briefing still answers while the quota is used up.
      const dedupe = await call("createBriefing", { token: key.token, body: { date: "2026-10-03", scope: "world" } });
      assert.equal(dedupe.status, 200);
      assert.equal(dedupe.body.deduplicated, true);
    } finally {
      process.env.API_PRO_PIPELINE_JOBS_PER_DAY = "50";
    }
  });

  test("Postgres limiter: the request after the limit is denied, then allowed in a later window", async () => {
    const limiter = new PostgresRateLimiter();
    const bucket = `test:${randomUUID()}`;
    const t = new Date("2026-10-12T06:00:05.000Z");
    assert.equal((await limiter.consume(bucket, 2, t)).allowed, true);
    assert.equal((await limiter.consume(bucket, 2, t)).allowed, true);
    const denied = await limiter.consume(bucket, 2, t);
    assert.equal(denied.allowed, false);
    assert.ok(denied.retryAfterSeconds >= 1);
    // Denied requests don't count: still 2 in the window.
    const row = await prisma.apiRateLimitWindow.findFirst({ where: { bucket } });
    assert.equal(row?.count, 2);
    assert.equal((await limiter.consume(bucket, 2, new Date("2026-10-12T06:02:00.000Z"))).allowed, true);
  });

  test("the route answers 429 with X-RateLimit headers", async () => {
    const frank = await createUser("frank");
    const key = await createKey(frank.id);
    process.env.API_PRO_REQUESTS_PER_MINUTE = "2";
    try {
      const a = await call("me", { token: key.token });
      assert.equal(a.headers.get("x-ratelimit-limit"), "2");
      await call("me", { token: key.token });
      const limited = await call("me", { token: key.token });
      assert.equal(limited.status, 429);
      assert.ok(limited.headers.get("retry-after"));
    } finally {
      process.env.API_PRO_REQUESTS_PER_MINUTE = "10000";
    }
  });
});

describe("webhooks", () => {
  test("job with webhookUrl: enqueued, waits for the pipeline, then one signed delivery", async () => {
    const res = await call("createResearch", {
      token: aliceKey.token,
      body: { instrumentKey: RELIANCE, prompt: "Webhook check", webhookUrl: "https://8.8.8.8/hooks/ds" },
    });
    assert.equal(res.status, 202);
    assert.deepEqual(res.body.webhook, { url: "https://8.8.8.8/hooks/ds", status: "pending" });
    assert.ok(eventsNamed(API_JOB_WEBHOOK_EVENT).some((e) => e.data.jobId === res.body.id));

    assert.equal(await isJobReadyForWebhook(res.body.id), false);
    await prisma.stockResearch.update({ where: { id: res.body.resource.id }, data: { status: "FAILED", completedAt: new Date() } });
    assert.equal(await isJobReadyForWebhook(res.body.id), true);

    const posts: Parameters<typeof import("@/lib/api/v1/webhooks").postWebhook>[0][] = [];
    const result = await deliverJobWebhook(res.body.id, async (input) => {
      posts.push(input);
      return { status: 200 };
    });
    assert.deepEqual(result, { delivered: true, status: 200 });
    assert.equal(posts.length, 1);
    assert.equal(posts[0]!.event, "job.failed");
    const payload = posts[0]!.payload as { type: string; data: { job: { id: string; status: string } } };
    assert.equal(payload.data.job.status, "failed");

    const secret = await prisma.apiWebhookSecret.findUniqueOrThrow({ where: { userId: alice.id } });
    assert.equal(posts[0]!.secret, secret.secret);

    const job = await call("getJob", { token: aliceKey.token, params: { id: res.body.id } });
    assert.equal(job.body.webhook.status, "delivered");
    // Already delivered: a retry is a no-op.
    assert.equal((await deliverJobWebhook(res.body.id, async () => ({ status: 200 }))).delivered, false);
  });

  test("signature matches what receivers verify", async () => {
    const { signWebhookPayload } = await import("@/lib/api/v1/webhooks");
    const body = JSON.stringify({ hello: "world" });
    const ts = Math.floor(Date.now() / 1000);
    assert.ok(verifyWebhookSignature({ secret: "whsec_a", timestamp: String(ts), body, signature: signWebhookPayload("whsec_a", ts, body) }));
  });

  test("private webhook URLs are refused", async () => {
    const res = await call("createBriefing", {
      token: aliceKey.token,
      body: { date: "2026-09-29", scope: "world", webhookUrl: "https://169.254.169.254/latest" },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.details.fields[0].path, "webhookUrl");
  });
});

describe("request log", () => {
  test("every call above was logged; accepted pipeline jobs answered 202", async () => {
    const logs = await prisma.apiRequestLog.findMany({ where: { userId: alice.id } });
    assert.ok(logs.length > 10);
    assert.ok(logs.some((l) => l.costClass === "pipeline" && l.status === 202));
    assert.ok(logs.every((l) => l.requestId.length >= 8));
    const key = await prisma.apiKey.findUniqueOrThrow({ where: { id: aliceKey.id } });
    assert.ok(key.lastUsedAt);
  });
});

describe("contract", () => {
  test("every response in this file matched the OpenAPI document", () => {
    assert.deepEqual(contractViolations, []);
  });
});
