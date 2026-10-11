/**
 * Run / agent / step / tool spans on top of the Neatlogs SDK.
 *
 * - `startRun` opens the run's root WORKFLOW span and returns a JSON
 *   `RunContext` carrying its W3C `traceparent`.
 * - `withAgentSpan` / `withStepSpan` / `withToolSpan` open AGENT / CHAIN / TOOL
 *   spans. With no enclosing span in this process (e.g. a new Inngest step
 *   request), they rejoin the run's trace through `extractTraceContext`.
 * - LLM calls stay on the `wrapOpenAI` instrumentation and nest under the
 *   active span; `AIClient` reports their usage via `recordLlmUsage`, which is
 *   summed onto every enclosing span.
 *
 * Tracing never changes behaviour: errors from wrapped code are recorded and
 * rethrown unchanged, and a tracing failure runs the code untraced.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { neatlogsClient } from "@/clients/neatlogsClient";
import {
  addUsage,
  emptyUsageTotals,
  type LlmUsage,
  type UsageTotals,
} from "@/lib/observability/llmUsage";
import {
  runMetadata,
  runTags,
  type RunContext,
  type RunSource,
} from "@/lib/observability/runContext";
import { clipForSpan, safeStringify } from "@/lib/observability/sanitize";

type TraceSpan = Parameters<Parameters<typeof neatlogsClient.trace>[1]>[0];
type AttributeValue = string | number | boolean | string[];

type ToolNotes = { retries: number; fellBack: boolean };

type Scope = {
  ctx: RunContext;
  totals: UsageTotals;
  parent: Scope | null;
  tool: ToolNotes | null;
};

const scopes = new AsyncLocalStorage<Scope>();

function warn(message: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  console.warn(`[observability] ${message}: ${detail}`);
}

function isTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === "TimeoutError" || error.name === "AbortError") {
    return true;
  }
  if ((error as { kind?: unknown }).kind === "timeout") {
    return true;
  }
  return /timed?\s?out/i.test(error.message);
}

type SpanSpec = {
  name: string;
  kind: "WORKFLOW" | "AGENT" | "CHAIN" | "TOOL";
  ctx: RunContext;
  input: unknown;
  tags: string[];
  metadata: Record<string, unknown>;
  attributes?: Record<string, AttributeValue>;
  version?: string;
  sessionId?: string;
  tool?: boolean;
};

function finishSpan(
  span: TraceSpan,
  scope: Scope,
  metadata: Record<string, unknown>,
  startedAt: number,
  outcome: { status: "ok" | "error"; error?: unknown; result?: unknown },
) {
  try {
    const durationMs = Date.now() - startedAt;
    const totals = scope.totals;
    const errorMessage =
      outcome.error instanceof Error
        ? outcome.error.message
        : outcome.error != null
          ? String(outcome.error)
          : null;
    const attributes: Record<string, AttributeValue> = {
      "run.status": outcome.status,
      "run.duration_ms": durationMs,
      "run.llm_calls": totals.llmCalls,
      "run.tokens.input": totals.inputTokens,
      "run.tokens.output": totals.outputTokens,
      "run.tokens.reasoning": totals.reasoningTokens,
      ...(totals.costUsd != null ? { "run.cost_usd": totals.costUsd } : {}),
      ...(totals.models.length ? { "run.models": totals.models } : {}),
      ...(errorMessage ? { "error.message": errorMessage.slice(0, 1_000) } : {}),
    };
    const toolFields = scope.tool
      ? {
          retries: scope.tool.retries,
          fellBack: scope.tool.fellBack,
          timedOut: outcome.status === "error" && isTimeout(outcome.error),
        }
      : null;
    if (toolFields) {
      attributes["tool.retries"] = toolFields.retries;
      attributes["tool.fell_back"] = toolFields.fellBack;
      attributes["tool.timed_out"] = toolFields.timedOut;
    }
    for (const [key, value] of Object.entries(attributes)) {
      span.setAttribute(key, value);
    }
    span.setAttribute(
      "metadata",
      safeStringify({
        ...metadata,
        status: outcome.status,
        durationMs,
        error: errorMessage,
        llmCalls: totals.llmCalls,
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        costUsd: totals.costUsd,
        models: totals.models,
        ...(toolFields ?? {}),
      }),
    );
    if (outcome.result !== undefined) {
      span.setAttribute("output.value", safeStringify(clipForSpan(outcome.result)));
    }
  } catch (error) {
    warn("could not finish span", error);
  }
}

async function runSpan<T>(spec: SpanSpec, fn: () => Promise<T>): Promise<T> {
  const parent = scopes.getStore() ?? null;
  const scope: Scope = {
    ctx: spec.ctx,
    totals: emptyUsageTotals(),
    parent,
    tool: spec.tool ? { retries: 0, fellBack: false } : null,
  };
  const run = () => scopes.run(scope, fn);
  const metadata = { ...runMetadata(spec.ctx), ...spec.metadata };
  const startedAt = Date.now();
  let entered = false;

  const body = async (span: TraceSpan) => {
    entered = true;
    try {
      const result = await run();
      finishSpan(span, scope, metadata, startedAt, { status: "ok", result });
      return result;
    } catch (error) {
      finishSpan(span, scope, metadata, startedAt, { status: "error", error });
      throw error;
    }
  };

  const open = () =>
    neatlogsClient.trace(
      {
        name: spec.name,
        kind: spec.kind,
        input: clipForSpan(spec.input),
        endUserId: spec.ctx.endUserId,
        ...(spec.sessionId ? { sessionId: spec.sessionId } : {}),
        ...(spec.version ? { version: spec.version } : {}),
        attributes: {
          ...spec.attributes,
          "run.id": spec.ctx.runId,
          "tag.tags": [...runTags(spec.ctx), ...spec.tags],
          metadata: safeStringify(metadata),
        },
      },
      body,
    );

  try {
    if (!parent && spec.ctx.traceparent) {
      return await neatlogsClient.extractTraceContext(
        { traceparent: spec.ctx.traceparent },
        open,
      );
    }
    return await open();
  } catch (error) {
    if (entered) {
      throw error;
    }
    warn(`tracing failed for ${spec.name}; running untraced`, error);
    return run();
  }
}

export type StartRunInput = {
  agentGroup: string;
  source: RunSource;
  /** Clerk user id, or `SYSTEM_END_USER_ID` for cron / newsletter runs. */
  endUserId: string;
  /** Internal `users.id`. */
  userId?: string | null;
  sessionId?: string | null;
  market?: "IN" | "US" | null;
  assetType?: string | null;
  /** What the user asked for; recorded (clipped) on the root span. */
  input?: unknown;
};

/** Opens the run's root span. Call once per user action. */
export async function startRun(input: StartRunInput): Promise<RunContext> {
  const ctx: RunContext = {
    runId: randomUUID(),
    traceparent: null,
    source: input.source,
    agentGroup: input.agentGroup,
    endUserId: input.endUserId,
    userId: input.userId ?? null,
    sessionId: input.sessionId ?? null,
    market: input.market ?? null,
    assetType: input.assetType ?? null,
    startedAt: new Date().toISOString(),
  };
  try {
    await neatlogsClient.ready();
    await runSpan(
      {
        name: `${input.agentGroup}.run`,
        kind: "WORKFLOW",
        ctx,
        input: input.input ?? {},
        tags: [],
        metadata: {},
        sessionId: ctx.sessionId ?? undefined,
      },
      async () => {
        const carrier: Record<string, string> = {};
        if (neatlogsClient.injectTraceContext(carrier)) {
          ctx.traceparent = carrier.traceparent ?? null;
        }
        return { runId: ctx.runId };
      },
    );
  } catch (error) {
    warn("could not open run trace", error);
  }
  return ctx;
}

/** Final CHAIN span with the run's outcome and wall-clock duration. */
export async function finishRun(
  ctx: RunContext,
  outcome: { status: "ok" | "error"; output?: unknown; error?: unknown },
): Promise<void> {
  const totalMs = Date.now() - new Date(ctx.startedAt).getTime();
  try {
    await runSpan(
      {
        name: `${ctx.agentGroup}.finish`,
        kind: "CHAIN",
        ctx,
        input: { status: outcome.status },
        tags: [`outcome:${outcome.status}`],
        metadata: { runOutcome: outcome.status, runDurationMs: totalMs },
        attributes: {
          "run.outcome": outcome.status,
          "run.total_duration_ms": totalMs,
          ...(outcome.error != null
            ? {
                "run.error":
                  outcome.error instanceof Error
                    ? outcome.error.message
                    : String(outcome.error),
              }
            : {}),
        },
      },
      async () => outcome.output ?? { status: outcome.status },
    );
  } catch (error) {
    warn("could not record run finish", error);
  }
}

/** AGENT span around one agent call. */
export function withAgentSpan<T>(
  agentName: string,
  ctx: RunContext,
  input: unknown,
  fn: () => Promise<T>,
  options: { promptVersion?: string } = {},
): Promise<T> {
  return runSpan(
    {
      name: `agent.${agentName}`,
      kind: "AGENT",
      ctx,
      input,
      tags: [`agent:${agentName}`],
      metadata: { agent: agentName, promptVersion: options.promptVersion ?? null },
      attributes: {
        "agent.name": agentName,
        ...(options.promptVersion
          ? { "agent.prompt_version": options.promptVersion }
          : {}),
      },
      version: options.promptVersion,
    },
    fn,
  );
}

/** CHAIN span around a pipeline step that is not itself an agent (tool fan-out, scraping). */
export function withStepSpan<T>(
  stepName: string,
  ctx: RunContext,
  input: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  return runSpan(
    {
      name: `step.${stepName}`,
      kind: "CHAIN",
      ctx,
      input,
      tags: [`step:${stepName}`],
      metadata: { step: stepName },
    },
    fn,
  );
}

/**
 * TOOL span around one external call. `ctx` defaults to the enclosing run; with
 * no run at all (e.g. an autocomplete route) the call runs untraced.
 */
export function withToolSpan<T>(
  toolName: string,
  ctx: RunContext | null,
  input: unknown,
  fn: () => Promise<T>,
  options: { provider: string },
): Promise<T> {
  const runCtx = ctx ?? scopes.getStore()?.ctx;
  if (!runCtx) {
    return fn();
  }
  return runSpan(
    {
      name: `tool.${toolName}`,
      kind: "TOOL",
      ctx: runCtx,
      input,
      tags: [`tool:${toolName}`, `provider:${options.provider}`],
      metadata: { tool: toolName, provider: options.provider },
      attributes: { "tool.name": toolName, "tool.provider": options.provider },
      tool: true,
    },
    fn,
  );
}

/** Wraps a tool function so every call gets a TOOL span (inside a run). */
export function traceToolFn<TFn extends (...args: never[]) => unknown>(
  toolName: string,
  provider: string,
  fn: TFn,
): TFn {
  return ((...args: Parameters<TFn>) =>
    withToolSpan(
      toolName,
      null,
      args.length === 1 ? args[0] : args,
      async () => fn(...args),
      { provider },
    )) as unknown as TFn;
}

function nearestTool(): ToolNotes | null {
  for (let scope = scopes.getStore(); scope; scope = scope.parent ?? undefined) {
    if (scope.tool) {
      return scope.tool;
    }
  }
  return null;
}

/** Call from a client's retry loop; counted on the enclosing tool span. */
export function noteToolRetry(): void {
  const tool = nearestTool();
  if (tool) {
    tool.retries += 1;
  }
}

/** Call when a client switches to its fallback path. */
export function noteToolFallback(): void {
  const tool = nearestTool();
  if (tool) {
    tool.fellBack = true;
  }
}

/** Called by `AIClient` after each LLM call; summed onto every enclosing span. */
export function recordLlmUsage(usage: LlmUsage): void {
  for (let scope = scopes.getStore(); scope; scope = scope.parent ?? undefined) {
    addUsage(scope.totals, usage);
  }
}

/** The run of the current span, if any. */
export function currentRunContext(): RunContext | null {
  return scopes.getStore()?.ctx ?? null;
}
