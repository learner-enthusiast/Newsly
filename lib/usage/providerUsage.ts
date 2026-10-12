/**
 * Usage tracking around the two provider choke points (`clients/serpCleint.ts`,
 * `clients/FireCrawlClient.ts`). Each wrapper runs the call unchanged, then
 * records one `ProviderUsage` row for who caused it (run context) and what it
 * cost (`creditRules`). Recording never changes the call's result or error.
 */

import { currentRunContext, traceLog } from "@/lib/observability";
import {
  classifySerpError,
  firecrawlScrapeCredits,
  serpArchiveCredits,
  serpErrorMessage,
  serpSearchCredits,
  type CreditDecision,
  type FirecrawlScrapeOptionsForCredits,
} from "@/lib/usage/creditRules";
import { recordProviderUsage, usageEnvironment } from "@/lib/usage/recorder";

type Provider = "serpapi" | "firecrawl";

type UsageEvent = {
  provider: Provider;
  operation: string;
  decision: CreditDecision;
  httpStatus: number | null;
  durationMs: number;
  detail: Record<string, unknown>;
};

const MAX_ERROR_CHARS = 160;

function truncate(value: string | null): string | null {
  return value ? value.slice(0, MAX_ERROR_CHARS) : null;
}

/** Run sources outside the app's request flows (eval, batch) all count as "script". */
function usageSource(source: string | undefined): string {
  if (!source || source === "eval" || source === "batch") {
    return "script";
  }
  return source;
}

/** `build` runs inside the guard too, so a bad payload can't break the call. */
function record(build: () => UsageEvent | null): void {
  let label = "provider call";
  try {
    const event = build();
    if (!event) {
      return;
    }
    label = `${event.provider}.${event.operation}`;
    const context = currentRunContext();
    if (event.decision.warning) {
      console.warn(`[usage] ${event.provider}.${event.operation}: ${event.decision.warning}`);
    }
    recordProviderUsage({
      // Request time, not flush time.
      createdAt: new Date(),
      provider: event.provider,
      operation: event.operation,
      userId: context?.userId ?? null,
      runId: context?.runId ?? null,
      source: usageSource(context?.source),
      workflow: context?.workflow ?? null,
      editionId: context?.editionId ?? null,
      ipHash: context?.ipHash ?? null,
      environment: usageEnvironment(),
      credits: event.decision.credits,
      billable: event.decision.billable,
      reason: event.decision.reason,
      httpStatus: event.httpStatus,
      durationMs: event.durationMs,
      detail: {
        ...event.detail,
        ...(event.decision.warning ? { pricingFallback: true } : {}),
      },
    });
    // Lands on the active TOOL span (serp.search / firecrawl.scrape).
    traceLog("provider.usage", {
      "usage.provider": event.provider,
      "usage.operation": event.operation,
      "usage.credits": event.decision.credits,
      "usage.reason": event.decision.reason,
    });
  } catch (error) {
    console.warn(
      `[usage] could not record ${label}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ── SerpApi ─────────────────────────────────────────────────────────────────

const SERP_RESULT_ARRAYS = [
  "organic_results",
  "news_results",
  "video_results",
  "local_results",
  "suggestions",
  "transcript",
  "text_blocks",
] as const;

/** Engine settings and result counts only — never the query, location text or key. */
function serpRequestDetail(params: Record<string, unknown>): Record<string, unknown> {
  const pick = (key: string) =>
    typeof params[key] === "string" || typeof params[key] === "number" ? params[key] : undefined;
  return {
    engine: params.engine ?? "google",
    ...(pick("num") !== undefined ? { num: pick("num") } : {}),
    ...(pick("start") !== undefined ? { start: pick("start") } : {}),
    ...(pick("hl") !== undefined ? { hl: pick("hl") } : {}),
    ...(pick("gl") !== undefined ? { gl: pick("gl") } : {}),
    ...(typeof params.tbm === "string" ? { tbm: params.tbm } : {}),
    hasLocation: typeof params.location === "string" || params.ll != null,
    hasPageToken: typeof params.page_token === "string",
  };
}

function serpResponseDetail(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    return {};
  }
  const record = payload as Record<string, unknown>;
  const counts: Record<string, number> = {};
  for (const key of SERP_RESULT_ARRAYS) {
    if (Array.isArray(record[key])) {
      counts[key] = (record[key] as unknown[]).length;
    }
  }
  const meta = record.search_metadata as { id?: unknown } | undefined;
  return {
    resultCounts: counts,
    ...(typeof meta?.id === "string" ? { searchId: meta.id } : {}),
    ...(typeof record.error === "string" ? { apiError: truncate(record.error) } : {}),
  };
}

/** Wrap one SerpApi `search` HTTP request (any engine). */
export async function trackSerpSearch<T>(
  params: Record<string, unknown>,
  call: () => Promise<T>,
): Promise<T> {
  const requestStartedAt = new Date();
  const started = performance.now();
  const operation = typeof params.engine === "string" ? params.engine : "google";
  let payload: T;
  try {
    payload = await call();
  } catch (error) {
    const durationMs = Math.round(performance.now() - started);
    record(() => {
      const outcome = classifySerpError(error);
      // Null: the request was never sent, nothing to record.
      return outcome
        ? {
            provider: "serpapi",
            operation,
            decision: serpSearchCredits(outcome),
            httpStatus: null,
            durationMs,
            detail: {
              ...serpRequestDetail(params),
              errorKind: outcome.kind,
              error: truncate(serpErrorMessage(error)),
            },
          }
        : null;
    });
    throw error;
  }
  const durationMs = Math.round(performance.now() - started);
  record(() => ({
    provider: "serpapi",
    operation,
    decision: serpSearchCredits({ kind: "response", payload, requestStartedAt }),
    httpStatus: 200,
    durationMs,
    detail: { ...serpRequestDetail(params), ...serpResponseDetail(payload) },
  }));
  return payload;
}

/** Wrap one SerpApi search-archive fetch (`getBySearchId`). Free, but logged. */
export async function trackSerpArchive<T>(call: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    const payload = await call();
    record(() => ({
      provider: "serpapi",
      operation: "search_archive",
      decision: serpArchiveCredits(),
      httpStatus: 200,
      durationMs: Math.round(performance.now() - started),
      detail: {},
    }));
    return payload;
  } catch (error) {
    record(() => ({
      provider: "serpapi",
      operation: "search_archive",
      decision: serpArchiveCredits(),
      httpStatus: null,
      durationMs: Math.round(performance.now() - started),
      detail: { error: truncate(serpErrorMessage(error)) },
    }));
    throw error;
  }
}

// ── Firecrawl ───────────────────────────────────────────────────────────────

function urlHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function firecrawlResponseDetail(response: unknown): Record<string, unknown> {
  const meta =
    response && typeof response === "object"
      ? ((response as { metadata?: Record<string, unknown> }).metadata ?? null)
      : null;
  if (!meta) {
    return {};
  }
  const keep = ["statusCode", "cacheState", "proxyUsed", "contentType", "numPages", "creditsUsed"];
  return Object.fromEntries(keep.filter((key) => meta[key] != null).map((key) => [key, meta[key]]));
}

/** HTTP status the Firecrawl SDK attaches to its `SdkError`, if any. */
function sdkErrorStatus(error: unknown): number | null {
  const status =
    error && typeof error === "object" ? (error as { status?: unknown }).status : undefined;
  return typeof status === "number" ? status : null;
}

/** Wrap one Firecrawl scrape. Records the URL host only, never the full URL. */
export async function trackFirecrawlScrape<T>(
  url: string,
  options: FirecrawlScrapeOptionsForCredits & { onlyMainContent?: boolean },
  call: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  const requestDetail = {
    host: urlHost(url),
    formats: options.formats ?? [],
    ...(options.onlyMainContent !== undefined ? { onlyMainContent: options.onlyMainContent } : {}),
    ...(options.proxy ? { proxy: options.proxy } : {}),
  };
  let response: T;
  try {
    response = await call();
  } catch (error) {
    record(() => ({
      provider: "firecrawl",
      operation: "scrape",
      decision: firecrawlScrapeCredits(undefined, options),
      httpStatus: sdkErrorStatus(error),
      durationMs: Math.round(performance.now() - started),
      detail: {
        ...requestDetail,
        error: truncate(error instanceof Error ? error.message : String(error)),
      },
    }));
    throw error;
  }
  record(() => ({
    provider: "firecrawl",
    operation: "scrape",
    decision: firecrawlScrapeCredits(response, options),
    httpStatus: 200,
    durationMs: Math.round(performance.now() - started),
    detail: { ...requestDetail, ...firecrawlResponseDetail(response) },
  }));
  return response;
}
