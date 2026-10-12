/**
 * The one place that calls the Neatlogs tracing API. `init()`, `wrapOpenAI` and
 * the AI SDK wrapper stay in `clients/neatlogsClient.ts`.
 *
 * Docs: https://docs.neatlogs.com/sdk/typescript · /sdk/end-user-identity ·
 * /sdk/multiple-workflows · /sdk/distributed-tracing
 *
 * - `runWorkflow` opens a run's root: `identify({ endUserId, sessionId })` +
 *   `trace({ kind: "WORKFLOW" })` with `neatlogs.workflow.name`. End user is
 *   declared only here (the SDK ignores it on child spans).
 * - `traceCarrier` / `continueWorkflow` carry the trace across Inngest steps
 *   (separate requests): W3C context goes in event data, identity is re-bound
 *   with `identify()` because `traceparent` does not carry it, and every step
 *   flushes before returning.
 * - `agent` / `tool` / `embedding` wrap functions with `span()`.
 *
 * Tracing never changes behaviour: wrapped errors are recorded and rethrown,
 * and a failure inside the SDK runs the code untraced.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  extractTraceContext,
  flush,
  identify,
  injectTraceContext,
  log,
  span,
  trace,
} from "neatlogs";
import { z } from "zod";
import {
  addUsage,
  emptyUsageTotals,
  type LlmUsage,
  type UsageTotals,
} from "@/lib/observability/llmUsage";

export const WORKFLOWS = {
  stockResearch: "Stock research",
  chat: "Chat",
  news: "News",
  newsRerun: "News rerun",
  newsletter: "Newsletter",
  embeddings: "Embeddings",
} as const;
export type WorkflowName = (typeof WORKFLOWS)[keyof typeof WORKFLOWS];

/** `endUserId` for runs with no signed-in user (cron, newsletter editions). */
export const SYSTEM_END_USER_ID = "system";

export type RunSource =
  | "web"
  | "chat"
  | "api"
  | "newsletter"
  | "eval"
  | "batch"
  | "cron"
  | "script";

/**
 * Plain-JSON handle on a running workflow, stored in Inngest event data as
 * `trace` so every step (and invoked / follow-up functions) can rejoin it.
 */
export const workflowRefSchema = z.object({
  workflow: z.string().min(1),
  runId: z.string().min(1),
  /** Clerk user id or `SYSTEM_END_USER_ID`. */
  endUserId: z.string().min(1),
  sessionId: z.string().nullable(),
  /** W3C `traceparent` / `tracestate` of the root span. */
  carrier: z.record(z.string(), z.string()),
  tags: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown()),
});
export type WorkflowRef = z.infer<typeof workflowRefSchema>;

export type WorkflowOptions = {
  /** Clerk user id from the API route, or `SYSTEM_END_USER_ID`. */
  endUserId: string;
  sessionId?: string | null;
  runId?: string;
  source: RunSource;
  /** Internal `users.id` (metadata only; end user is the Clerk id). */
  userId?: string | null;
  market?: "IN" | "US" | null;
  assetType?: string | null;
  /** Prompt versions of the agents this workflow runs, for before/after comparisons. */
  promptVersions?: Record<string, string>;
  /** Shared newsletter edition this run builds (provider spend goes to the edition). */
  editionId?: string | null;
  /** Shown as the trace input. */
  input?: unknown;
  /** Extra trace metadata, e.g. `{ apiKeyId, requestId, plan }` for public API runs. */
  metadata?: Record<string, unknown>;
};

type ActiveSpan = { setAttribute(key: string, value: string | number | boolean | string[]): unknown };

let cachedGitSha: string | undefined;

function gitSha(): string {
  if (cachedGitSha) return cachedGitSha;
  const fromEnv =
    process.env.GIT_SHA?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.SOURCE_COMMIT?.trim();
  try {
    cachedGitSha =
      fromEnv?.slice(0, 12) ||
      execSync("git rev-parse --short=12 HEAD", { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
  } catch {
    cachedGitSha = "unknown";
  }
  return cachedGitSha || "unknown";
}

function warn(message: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  console.warn(`[neatlogs] ${message}: ${detail}`);
}

/** The run ref carried in an Inngest event (also inside an `onFailure` event). */
export function workflowRefFromEvent(event: unknown): WorkflowRef | null {
  const data = (event as { data?: Record<string, unknown> } | undefined)?.data;
  const failed = (data?.event as { data?: Record<string, unknown> } | undefined)?.data;
  const parsed = workflowRefSchema.safeParse(data?.trace ?? failed?.trace);
  return parsed.success ? parsed.data : null;
}

/**
 * `{ trace }` to spread into a follow-up event so it joins the same run.
 * `metadata` is merged into the ref (e.g. `{ editionId }`) for that branch only.
 */
export function traceField(
  event: unknown,
  metadata?: Record<string, unknown>,
): { trace?: WorkflowRef } {
  const ref = workflowRefFromEvent(event);
  if (!ref) {
    return {};
  }
  return { trace: metadata ? { ...ref, metadata: { ...ref.metadata, ...metadata } } : ref };
}

// ── Run context: who a unit of work runs for, read by provider usage tracking ──

export type RunContext = {
  runId: string | null;
  workflow: string | null;
  /** `users.id`; null = system. */
  userId: string | null;
  source: string;
  editionId: string | null;
  /** Salted hash of the caller's IP, for signed-out requests. */
  ipHash: string | null;
};

const runContexts = new AsyncLocalStorage<RunContext>();

/** The run the current code executes for, or null outside any run. */
export function currentRunContext(): RunContext | null {
  return runContexts.getStore() ?? null;
}

/** Bind a run context for work that isn't a workflow (e.g. a plain API route). */
export function withRunContext<T>(context: RunContext, fn: () => Promise<T>): Promise<T> {
  return runContexts.run(context, fn);
}

function runContextFromRef(ref: WorkflowRef): RunContext {
  const meta = ref.metadata;
  const editionId = typeof meta.editionId === "string" ? meta.editionId : null;
  return {
    runId: ref.runId,
    workflow: ref.workflow,
    // Edition spend belongs to the shared edition, never to one subscriber.
    userId: editionId ? null : typeof meta.userId === "string" ? meta.userId : null,
    source: typeof meta.source === "string" ? meta.source : "script",
    editionId,
    ipHash: null,
  };
}

// ── LLM usage: AIClient reports each call; summed onto the enclosing root / step ──

const usageScopes = new AsyncLocalStorage<UsageTotals[]>();

/** Called by `AIClient` after every LLM call. */
export function recordLlmUsage(usage: LlmUsage): void {
  for (const totals of usageScopes.getStore() ?? []) {
    addUsage(totals, usage);
  }
}

function withUsage<T>(fn: (totals: UsageTotals) => Promise<T>): Promise<T> {
  const totals = emptyUsageTotals();
  return usageScopes.run([...(usageScopes.getStore() ?? []), totals], () => fn(totals));
}

function setUsage(active: ActiveSpan | null, totals: UsageTotals, durationMs: number) {
  if (!active) return;
  try {
    active.setAttribute("run.duration_ms", durationMs);
    active.setAttribute("run.llm_calls", totals.llmCalls);
    active.setAttribute("run.tokens.input", totals.inputTokens);
    active.setAttribute("run.tokens.output", totals.outputTokens);
    if (totals.costUsd != null) active.setAttribute("run.cost_usd", totals.costUsd);
    if (totals.models.length) active.setAttribute("run.models", totals.models);
  } catch (error) {
    warn("could not record usage", error);
  }
}

// ── Fail-open helper ──

/** Runs `body` inside `open`; if the SDK throws before `body` starts, runs it untraced. */
async function failOpen<T>(
  label: string,
  open: (body: (active: ActiveSpan) => Promise<T>) => Promise<T>,
  body: (active: ActiveSpan | null) => Promise<T>,
): Promise<T> {
  let entered = false;
  try {
    return await open((active) => {
      entered = true;
      return body(active);
    });
  } catch (error) {
    if (entered) throw error;
    warn(`${label}: tracing failed, running untraced`, error);
    return body(null);
  }
}

function spanAttributes(ref: WorkflowRef, extraTags: string[] = []) {
  return {
    "neatlogs.workflow.name": ref.workflow,
    "run.id": ref.runId,
    "tag.tags": [...ref.tags, ...extraTags],
    metadata: JSON.stringify(ref.metadata),
  };
}

// ── Workflows ──

/** W3C trace context of the active span, for event data / step results. */
export function traceCarrier(): Record<string, string> {
  const carrier: Record<string, string> = {};
  try {
    injectTraceContext(carrier);
  } catch (error) {
    warn("could not inject trace context", error);
  }
  return carrier;
}

/** Opens the root of one run (one user action = one trace). `fn` gets the run's ref. */
export async function runWorkflow<T>(
  workflow: WorkflowName,
  options: WorkflowOptions,
  fn: (ref: WorkflowRef) => Promise<T>,
): Promise<T> {
  const ref: WorkflowRef = {
    workflow,
    runId: options.runId ?? randomUUID(),
    endUserId: options.endUserId,
    sessionId: options.sessionId ?? null,
    carrier: {},
    tags: [
      `source:${options.source}`,
      ...(options.market ? [`market:${options.market}`] : []),
      ...(options.assetType ? [`assetType:${options.assetType}`] : []),
    ],
    metadata: {
      userId: options.userId ?? null,
      sessionId: options.sessionId ?? null,
      gitSha: gitSha(),
      source: options.source,
      market: options.market ?? null,
      assetType: options.assetType ?? null,
      promptVersions: options.promptVersions ?? {},
      ...(options.editionId ? { editionId: options.editionId } : {}),
      ...options.metadata,
    },
  };
  ref.metadata.runId = ref.runId;
  const startedAt = Date.now();

  return failOpen(
    workflow,
    (body) =>
      identify(
        { endUserId: ref.endUserId, ...(ref.sessionId ? { sessionId: ref.sessionId } : {}) },
        () =>
          trace(
            {
              name: workflow,
              kind: "WORKFLOW",
              input: options.input ?? {},
              attributes: spanAttributes(ref),
            },
            body,
          ),
      ),
    (active) =>
      withUsage(async (totals) => {
        if (active) ref.carrier = traceCarrier();
        try {
          return await runContexts.run(runContextFromRef(ref), () => fn(ref));
        } finally {
          setUsage(active, totals, Date.now() - startedAt);
        }
      }),
  );
}

/** Opens the root and returns the ref (for an API route that only enqueues work). */
export function startWorkflow(
  workflow: WorkflowName,
  options: WorkflowOptions,
): Promise<WorkflowRef> {
  return runWorkflow(workflow, options, async (ref) => ref);
}

/**
 * Runs one Inngest step (or any remote unit of work) inside the run's trace as
 * a CHAIN span, then flushes. Used by `neatlogsInngestMiddleware` for every
 * `step.run` whose event carries a `trace` ref.
 */
export async function continueWorkflow<T>(
  ref: WorkflowRef,
  stepName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await failOpen(
      stepName,
      (body) =>
        extractTraceContext(ref.carrier, () =>
          identify(
            { endUserId: ref.endUserId, ...(ref.sessionId ? { sessionId: ref.sessionId } : {}) },
            () =>
              trace(
                {
                  name: `step.${stepName}`,
                  kind: "CHAIN",
                  attributes: spanAttributes(ref, [`step:${stepName}`]),
                },
                body,
              ),
          ),
        ),
      (active) =>
        withUsage(async (totals) => {
          try {
            return await runContexts.run(runContextFromRef(ref), fn);
          } finally {
            setUsage(active, totals, Date.now() - startedAt);
          }
        }),
    );
  } finally {
    await flush().catch((error: unknown) => warn("flush failed", error));
  }
}

// ── Agent / tool / embedding spans ──

function wrapSpan<TArgs extends unknown[], TReturn>(
  options: Parameters<typeof span>[0],
  fn: (...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn {
  let traced: (...args: TArgs) => TReturn;
  try {
    traced = span(options, fn);
  } catch (error) {
    warn(`could not wrap ${options.name}`, error);
    return fn;
  }
  return (...args: TArgs) => {
    try {
      return traced(...args);
    } catch (error) {
      // `fn` is async, so its own errors reject; a sync throw comes from the SDK.
      warn(`${options.name}: tracing failed, running untraced`, error);
      return fn(...args);
    }
  };
}

/** AGENT span around an agent's run function. Name: "<area>.<agentName>". */
export function agent<TArgs extends unknown[], TReturn>(
  name: string,
  fn: (...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn {
  return wrapSpan({ kind: "AGENT", name }, fn);
}

/** TOOL span around an external call choke point. */
export function tool<TArgs extends unknown[], TReturn>(
  name: string,
  fn: (...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn {
  return wrapSpan({ kind: "TOOL", name, toolName: name }, fn);
}

/** EMBEDDING span around an embedding call. */
export function embedding<TArgs extends unknown[], TReturn>(
  name: string,
  model: string,
  fn: (...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn {
  return wrapSpan({ kind: "EMBEDDING", name, model }, fn);
}

/** Timestamped log step on the active span (e.g. a client retry). */
export function traceLog(message: string, fields: Record<string, unknown> = {}): void {
  try {
    log(message, fields);
  } catch {
    // Never let a log line affect the call.
  }
}
