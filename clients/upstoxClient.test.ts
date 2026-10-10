import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createUpstoxClient,
  UpstoxApiError,
} from "@/clients/upstoxClient";

function mockFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return handler as typeof fetch;
}

test("missing token throws UpstoxApiError", async () => {
  const client = createUpstoxClient({
    analyticsToken: "",
    fetchImpl: mockFetch(async () => new Response("{}")),
  });

  await assert.rejects(
    () => client.get("/v2/market/status/NSE"),
    (error: unknown) => {
      assert.ok(error instanceof UpstoxApiError);
      assert.equal(error.kind, "missing_token");
      return true;
    },
  );
});

test("successful GET parses JSON envelope", async () => {
  const client = createUpstoxClient({
    analyticsToken: "test-token",
    fetchImpl: mockFetch(async (_url, init) => {
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        "Bearer test-token",
      );
      return new Response(
        JSON.stringify({
          status: "success",
          data: { exchange: "NSE", status: "NORMAL_OPEN" },
        }),
        { status: 200 },
      );
    }),
  });

  const payload = await client.get<{ status: string; data: { exchange: string } }>(
    "/v2/market/status/NSE",
    { noRetry: true },
  );
  assert.equal(payload.data.exchange, "NSE");
});

test("401 maps to authentication error", async () => {
  const client = createUpstoxClient({
    analyticsToken: "bad",
    fetchImpl: mockFetch(async () =>
      Response.json(
        {
          status: "error",
          errors: [{ errorCode: "UDAPI100028", message: "Invalid token" }],
        },
        { status: 401 },
      ),
    ),
  });

  await assert.rejects(
    () => client.get("/v2/market/status/NSE", { noRetry: true }),
    (error: unknown) => {
      assert.ok(error instanceof UpstoxApiError);
      assert.equal(error.kind, "authentication");
      assert.equal(error.status, 401);
      return true;
    },
  );
});

test("400 maps to invalid_request", async () => {
  const client = createUpstoxClient({
    analyticsToken: "test",
    fetchImpl: mockFetch(async () =>
      Response.json({ status: "error", errors: [{ message: "Bad params" }] }, {
        status: 400,
      }),
    ),
  });

  await assert.rejects(
    () => client.get("/v2/market/fii", { noRetry: true }),
    (error: unknown) => {
      assert.ok(error instanceof UpstoxApiError);
      assert.equal(error.kind, "invalid_request");
      return true;
    },
  );
});

test("404 maps to not_found", async () => {
  const client = createUpstoxClient({
    analyticsToken: "test",
    fetchImpl: mockFetch(async () => new Response("{}", { status: 404 })),
  });

  await assert.rejects(
    () => client.get("/v2/market/status/INVALID", { noRetry: true }),
    (error: unknown) => {
      assert.ok(error instanceof UpstoxApiError);
      assert.equal(error.kind, "not_found");
      return true;
    },
  );
});

test("429 is retryable then succeeds", async () => {
  let calls = 0;
  const client = createUpstoxClient({
    analyticsToken: "test",
    maxRetries: 1,
    fetchImpl: mockFetch(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("{}", { status: 429 });
      }
      return Response.json({ status: "success", data: { ok: true } });
    }),
  });

  const result = await client.get<{ data: { ok: boolean } }>(
    "/v2/market/status/NSE",
  );
  assert.equal(result.data.ok, true);
  assert.equal(calls, 2);
});

test("500 retries then throws server error", async () => {
  const client = createUpstoxClient({
    analyticsToken: "test",
    maxRetries: 1,
    fetchImpl: mockFetch(async () => new Response("{}", { status: 500 })),
  });

  await assert.rejects(
    () => client.get("/v2/market/status/NSE"),
    (error: unknown) => {
      assert.ok(error instanceof UpstoxApiError);
      assert.equal(error.kind, "server");
      return true;
    },
  );
});

test("timeout surfaces timeout kind", async () => {
  const client = createUpstoxClient({
    analyticsToken: "test",
    defaultTimeoutMs: 5,
    maxRetries: 0,
    fetchImpl: mockFetch(
      () =>
        new Promise((_resolve, reject) => {
          const err = new Error("Timeout");
          err.name = "TimeoutError";
          reject(err);
        }),
    ),
  });

  await assert.rejects(
    () => client.get("/v2/market/status/NSE", { noRetry: true }),
    (error: unknown) => {
      assert.ok(error instanceof UpstoxApiError);
      assert.equal(error.kind, "timeout");
      return true;
    },
  );
});

test("malformed JSON response", async () => {
  const client = createUpstoxClient({
    analyticsToken: "test",
    fetchImpl: mockFetch(async () => new Response("not-json", { status: 200 })),
  });

  await assert.rejects(
    () => client.get("/v2/market/status/NSE", { noRetry: true }),
    (error: unknown) => {
      assert.ok(error instanceof UpstoxApiError);
      assert.equal(error.kind, "malformed");
      return true;
    },
  );
});
