/**
 * `apiRoute(endpoint, handler)` — the one wrapper every `/api/v1` route uses.
 *
 * In order, for each request:
 *  1. request id: `X-Request-Id` from the client when well-formed, else a new one
 *  2. Bearer key: shape check → SHA-256 → lookup; 401 when missing, unknown,
 *     revoked or expired
 *  3. plan: `getUserPlan` (User.plan + Subscription.currentPeriodEnd); not Pro → 403 plan_required
 *  4. scope → 403 forbidden
 *  5. rate limit per key (`RateLimiter`), X-RateLimit-* on every later response; 429 + Retry-After
 *  6. daily pipeline quota → 429 quota_exceeded. Exposed as `ctx.consumePipelineQuota()`
 *     and called by pipeline handlers right before they accept a job, so an
 *     idempotent replay or a deduplicated briefing never needs (or uses) quota.
 *     Only accepted jobs count.
 *  7. zod validation of params / query / body (strict, 64 KB max) → 400 with field details
 *  8. `Idempotency-Key` on idempotent endpoints (24h replay)
 *  9. handler; pipelines are traced by `runWorkflow` with `ctx.trace`
 *     (source "api", metadata { apiKeyId, requestId, plan })
 * 10. `ApiRequestLog` row + `touchApiKeyLastUsed` (at most once a minute)
 *
 * Errors always use `{ error: { code, message, details?, requestId } }`; a
 * 500 never carries the underlying message.
 */

import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { ApiKey } from "@/db/generated/client";
import type { CostClass, EndpointDef, EndpointInput } from "@/lib/api/v1/contract";
import {
  ApiError,
  apiErrorBody,
  INTERNAL_ERROR_MESSAGE,
} from "@/lib/api/v1/errors";
import {
  hashRequest,
  IDEMPOTENCY_KEY_PATTERN,
  type IdempotencyStore,
} from "@/lib/api/v1/idempotency";
import { hashApiKey, looksLikeApiKey } from "@/lib/api/v1/keys";
import { getApiPlanLimits, type ApiPlanLimits } from "@/lib/api/v1/limits";
import type { RateLimiter, RateLimitResult } from "@/lib/api/v1/rateLimit";
import type { PlanTier } from "@/lib/billing/plan";

export const MAX_BODY_BYTES = 64 * 1024;
const LAST_USED_RESOLUTION_MS = 60_000;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

// ── Dependencies (swappable in tests) ──

export type ApiKeyRecord = Pick<
  ApiKey,
  "id" | "userId" | "name" | "prefix" | "scopes" | "createdAt" | "expiresAt" | "revokedAt" | "lastUsedAt"
>;

export type ApiUser = { id: string; clerkId: string; email: string };

export type ApiRequestLogEntry = {
  apiKeyId: string;
  userId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  costClass: CostClass;
  requestId: string;
};

export type ApiDeps = {
  now(): Date;
  findApiKeyByHash(hashedKey: string): Promise<ApiKeyRecord | null>;
  getUserPlan(userId: string): Promise<PlanTier>;
  loadUser(userId: string): Promise<ApiUser | null>;
  rateLimiter: RateLimiter;
  /** Accepted pipeline jobs for the user since `since`. */
  countAcceptedPipelineJobs(userId: string, since: Date): Promise<number>;
  idempotency: IdempotencyStore;
  logRequest(entry: ApiRequestLogEntry): Promise<void>;
  touchApiKeyLastUsed(apiKeyId: string, at: Date): Promise<void>;
};

let depsFactory: (() => Promise<ApiDeps>) | null = null;
let depsPromise: Promise<ApiDeps> | null = null;

/** Production deps are loaded lazily so tests never need a database. */
async function defaultDeps(): Promise<ApiDeps> {
  const [
    { prisma },
    apiKeyRepo,
    { getUserPlan },
    { PostgresRateLimiter },
    { PostgresIdempotencyStore },
    { countAcceptedPipelineJobsSince },
  ] = await Promise.all([
    import("@/db"),
    import("@/repositories/apiKey"),
    import("@/lib/billing/plan"),
    import("@/lib/api/v1/rateLimit"),
    import("@/lib/api/v1/idempotency"),
    import("@/lib/api/v1/quota"),
  ]);
  return {
    now: () => new Date(),
    findApiKeyByHash: apiKeyRepo.findApiKeyByHash,
    getUserPlan,
    loadUser: (userId) =>
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, clerkId: true, email: true },
      }),
    rateLimiter: new PostgresRateLimiter(),
    countAcceptedPipelineJobs: countAcceptedPipelineJobsSince,
    idempotency: new PostgresIdempotencyStore(),
    logRequest: async (entry) => {
      await prisma.apiRequestLog.create({ data: entry });
    },
    touchApiKeyLastUsed: apiKeyRepo.touchApiKeyLastUsed,
  };
}

function getDeps(): Promise<ApiDeps> {
  depsPromise ??= (depsFactory ?? defaultDeps)();
  return depsPromise;
}

/** Tests: replace every dependency. Pass null to go back to production deps. */
export function setApiDeps(deps: ApiDeps | null): void {
  depsFactory = deps ? async () => deps : null;
  depsPromise = null;
}

// ── Context ──

type Infer<T> = T extends z.ZodType ? z.output<T> : undefined;

export type ApiTrace = {
  source: "api";
  metadata: { apiKeyId: string; requestId: string; plan: PlanTier };
};

export type ApiContext<I extends EndpointInput> = {
  request: Request;
  requestId: string;
  now: Date;
  apiKey: ApiKeyRecord;
  userId: string;
  plan: PlanTier;
  limits: ApiPlanLimits;
  params: Infer<I["params"]>;
  query: Infer<I["query"]>;
  body: Infer<I["body"]>;
  /** The key owner's `User` row (id, clerkId, primary email). */
  getUser(): Promise<ApiUser>;
  /** Pass to `runWorkflow` options. */
  trace: ApiTrace;
  /** Throws 429 quota_exceeded when today's accepted pipeline jobs reach the limit. */
  consumePipelineQuota(): Promise<void>;
  /** For handlers that return a status other than the endpoint's success status. */
  respond<B>(status: number, body: B, headers?: Record<string, string>): ApiResult<B>;
};

export class ApiResult<B = unknown> {
  constructor(
    readonly status: number,
    readonly body: B,
    readonly headers: Record<string, string> = {},
  ) {}
}

type RouteContext = { params: Promise<Record<string, string | string[]>> };

export type ApiRouteHandler = (request: Request, context: RouteContext) => Promise<Response>;

// ── Helpers ──

function newRequestId(): string {
  return `req_${randomBytes(12).toString("hex")}`;
}

function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt.getTime() / 1000)),
  };
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

export function fieldErrors(error: z.ZodError, location: "params" | "query" | "body") {
  return {
    fields: error.issues.flatMap((issue) => {
      const base = issue.path.map(String);
      // One entry per unknown field, named, instead of one at the parent.
      if (issue.code === "unrecognized_keys") {
        return issue.keys.map((key) => ({
          in: location,
          path: [...base, key].join("."),
          message: "Unknown field",
        }));
      }
      return [{ in: location, path: base.join(".") || "(root)", message: issue.message }];
    }),
  };
}

function readQuery(url: URL): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of url.searchParams) {
    const prev = out[key];
    out[key] = prev === undefined ? value : Array.isArray(prev) ? [...prev, value] : [prev, value];
  }
  return out;
}

async function readBodyText(request: Request): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new ApiError("payload_too_large", `Request body must be at most ${MAX_BODY_BYTES} bytes.`);
  }
  if (!request.body) {
    return "";
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new ApiError("payload_too_large", `Request body must be at most ${MAX_BODY_BYTES} bytes.`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonBody(request: Request): Promise<unknown> {
  const text = await readBodyText(request);
  if (text.trim() === "") {
    return {};
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/(.+\+)?json\b/i.test(contentType)) {
    throw new ApiError("unsupported_media_type", "Send the body as JSON with Content-Type: application/json.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("invalid_request", "Request body is not valid JSON.");
  }
}

function parseOrThrow<T extends z.ZodType>(
  schema: T,
  value: unknown,
  location: "params" | "query" | "body",
): z.output<T> {
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  if (location === "params") {
    // A malformed id can't exist: same answer as an id that isn't yours.
    throw new ApiError("not_found", "Resource not found.");
  }
  throw new ApiError("invalid_request", "Request validation failed.", {
    details: fieldErrors(parsed.error, location),
  });
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match ? match[1]! : "";
}

async function authenticate(request: Request, deps: ApiDeps, now: Date): Promise<ApiKeyRecord> {
  const challenge = { "WWW-Authenticate": 'Bearer realm="api"' };
  const token = bearerToken(request);
  if (token === null) {
    throw new ApiError("unauthorized", "Missing API key. Send Authorization: Bearer <key>.", {
      headers: challenge,
    });
  }
  if (!looksLikeApiKey(token)) {
    throw new ApiError("unauthorized", "Invalid API key.", { headers: challenge });
  }
  const key = await deps.findApiKeyByHash(hashApiKey(token));
  if (!key) {
    throw new ApiError("unauthorized", "Invalid API key.", { headers: challenge });
  }
  if (key.revokedAt) {
    throw new ApiError("unauthorized", "This API key has been revoked.", { headers: challenge });
  }
  if (key.expiresAt && key.expiresAt.getTime() <= now.getTime()) {
    throw new ApiError("unauthorized", "This API key has expired.", { headers: challenge });
  }
  return key;
}

// ── apiRoute ──

export function apiRoute<I extends EndpointInput, O extends z.ZodType>(
  endpoint: EndpointDef<I, O>,
  handler: (ctx: ApiContext<I>) => Promise<z.input<O> | ApiResult>,
): ApiRouteHandler {
  return async (request, routeContext) => {
    const started = Date.now();
    const incomingId = request.headers.get("x-request-id");
    const requestId = incomingId && REQUEST_ID_PATTERN.test(incomingId) ? incomingId : newRequestId();
    const path = new URL(request.url).pathname;
    const headers: Record<string, string> = { "X-Request-Id": requestId };

    let deps: ApiDeps | null = null;
    let apiKey: ApiKeyRecord | null = null;
    let idempotencyKey: string | null = null;
    let status = 500;
    let response: Response;

    try {
      deps = await getDeps();
      const now = deps.now();

      // 2. key
      apiKey = await authenticate(request, deps, now);
      const userId = apiKey.userId;

      // 3. plan
      const plan = await deps.getUserPlan(userId);
      const limits = getApiPlanLimits(plan);
      if (!limits) {
        throw new ApiError(
          "plan_required",
          "The API requires an active Pro plan. Upgrade at /pricing; your keys start working again right away.",
        );
      }

      // 4. scope
      if (endpoint.scope && !apiKey.scopes.includes(endpoint.scope)) {
        throw new ApiError("forbidden", `This key is missing the "${endpoint.scope}" scope.`, {
          details: { requiredScope: endpoint.scope },
        });
      }

      // 5. rate limit
      const rate = await deps.rateLimiter.consume(`key:${apiKey.id}`, limits.requestsPerMinute, now);
      Object.assign(headers, rateLimitHeaders(rate));
      if (!rate.allowed) {
        throw new ApiError(
          "rate_limited",
          `Rate limit of ${rate.limit} requests per minute exceeded. Retry after ${rate.retryAfterSeconds}s.`,
          { headers: { "Retry-After": String(rate.retryAfterSeconds) } },
        );
      }

      // 7. validation
      const rawParams = await routeContext.params;
      const params = endpoint.input.params
        ? parseOrThrow(endpoint.input.params, rawParams, "params")
        : undefined;
      const query = endpoint.input.query
        ? parseOrThrow(endpoint.input.query, readQuery(new URL(request.url)), "query")
        : undefined;
      let rawBody: unknown = undefined;
      const body = endpoint.input.body
        ? parseOrThrow(endpoint.input.body, (rawBody = await readJsonBody(request)), "body")
        : undefined;

      // 8. idempotency
      if (endpoint.idempotent) {
        const header = request.headers.get("idempotency-key");
        if (header !== null) {
          if (!IDEMPOTENCY_KEY_PATTERN.test(header)) {
            throw new ApiError("invalid_request", "Idempotency-Key must be 1–255 visible ASCII characters.");
          }
          const begin = await deps.idempotency.begin(
            {
              userId,
              key: header,
              method: request.method,
              path,
              requestHash: hashRequest(request.method, path, rawBody ?? null),
            },
            now,
          );
          if (begin.kind === "mismatch") {
            throw new ApiError(
              "idempotency_key_reused",
              "This Idempotency-Key was already used with a different request.",
            );
          }
          if (begin.kind === "in_progress") {
            throw new ApiError("conflict", "A request with this Idempotency-Key is still being processed.");
          }
          if (begin.kind === "replay") {
            status = begin.status;
            response = jsonResponse(begin.status, begin.body, {
              ...headers,
              "Idempotent-Replayed": "true",
            });
            return response;
          }
          idempotencyKey = header;
        }
      }

      // 6 + 9. handler (pipeline quota is consumed inside)
      let user: ApiUser | null = null;
      const activeDeps = deps;
      const key = apiKey;
      const ctx: ApiContext<I> = {
        request,
        requestId,
        now,
        apiKey: key,
        userId,
        plan,
        limits,
        params: params as Infer<I["params"]>,
        query: query as Infer<I["query"]>,
        body: body as Infer<I["body"]>,
        async getUser() {
          user ??= await activeDeps.loadUser(userId);
          if (!user) {
            throw new Error(`API key ${key.id} belongs to a missing user`);
          }
          return user;
        },
        trace: { source: "api", metadata: { apiKeyId: key.id, requestId, plan } },
        async consumePipelineQuota() {
          const dayStart = utcDayStart(now);
          const used = await activeDeps.countAcceptedPipelineJobs(userId, dayStart);
          if (used >= limits.pipelineJobsPerDay) {
            const resetsAt = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
            const retryAfter = Math.max(1, Math.ceil((resetsAt.getTime() - now.getTime()) / 1000));
            throw new ApiError(
              "quota_exceeded",
              `Daily quota of ${limits.pipelineJobsPerDay} pipeline jobs reached. It resets at ${resetsAt.toISOString()}.`,
              {
                details: { limit: limits.pipelineJobsPerDay, used, resetsAt: resetsAt.toISOString() },
                headers: { "Retry-After": String(retryAfter) },
              },
            );
          }
        },
        respond: (s, b, h) => new ApiResult(s, b, h),
      };

      const result = await handler(ctx);
      const out = result instanceof ApiResult ? result : new ApiResult(endpoint.successStatus, result);
      const schema = out.status === endpoint.successStatus
        ? endpoint.output
        : endpoint.extraResponses?.find((r) => r.status === out.status)?.schema;
      if (!schema) {
        throw new Error(`No response schema for status ${out.status} on ${endpoint.operationId}`);
      }
      const parsed = schema.safeParse(out.body);
      if (!parsed.success) {
        throw new Error(
          `Response of ${endpoint.operationId} does not match its schema: ${z.prettifyError(parsed.error)}`,
        );
      }

      status = out.status;
      response = jsonResponse(out.status, parsed.data, { ...headers, ...out.headers });
      if (idempotencyKey) {
        await deps.idempotency.complete(userId, idempotencyKey, out.status, parsed.data);
        idempotencyKey = null;
      }
      return response;
    } catch (error) {
      const apiError =
        error instanceof ApiError ? error : new ApiError("internal_error", INTERNAL_ERROR_MESSAGE);
      if (!(error instanceof ApiError)) {
        console.error("[api/v1] unhandled error", {
          requestId,
          operationId: endpoint.operationId,
          error: error instanceof Error ? (error.stack ?? error.message) : String(error),
        });
      }
      status = apiError.status;
      response = jsonResponse(apiError.status, apiErrorBody(apiError, requestId), {
        ...headers,
        ...apiError.headers,
      });
      return response;
    } finally {
      // Errors are not stored: the same key can be retried.
      if (idempotencyKey && deps && apiKey) {
        await deps.idempotency.release(apiKey.userId, idempotencyKey).catch((error) =>
          console.error("[api/v1] idempotency release failed", { requestId, error }),
        );
      }
      if (deps && apiKey) {
        await recordRequest(deps, apiKey, {
          apiKeyId: apiKey.id,
          userId: apiKey.userId,
          method: request.method,
          path,
          status,
          durationMs: Date.now() - started,
          costClass: endpoint.costClass,
          requestId,
        });
      }
    }
  };
}

async function recordRequest(deps: ApiDeps, key: ApiKeyRecord, entry: ApiRequestLogEntry) {
  try {
    await deps.logRequest(entry);
  } catch (error) {
    console.error("[api/v1] request log failed", { requestId: entry.requestId, error });
  }
  const now = deps.now();
  if (!key.lastUsedAt || now.getTime() - key.lastUsedAt.getTime() >= LAST_USED_RESOLUTION_MS) {
    deps.touchApiKeyLastUsed(key.id, now).catch((error) =>
      console.error("[api/v1] lastUsedAt update failed", { requestId: entry.requestId, error }),
    );
  }
}
