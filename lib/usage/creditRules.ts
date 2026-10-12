/**
 * Credit rules for SerpApi and Firecrawl — the one place to update when
 * provider pricing changes. Pure functions: no I/O, no clock reads (callers pass
 * the request start time), so every rule is unit-tested.
 *
 * Verified against live responses on 2026-10-12:
 * - SerpApi has no cache flag. A cache hit returns the ORIGINAL search's
 *   `search_metadata.id` and `created_at`, and isn't billed. `getBySearchId`
 *   (search archive) isn't billed either.
 * - The serpapi SDK rejects non-200 responses with the raw body string, and a
 *   client timeout with an `Error("The request was timed out")`.
 * - Firecrawl scrape responses carry `metadata.creditsUsed` (1 for a normal
 *   page, still 1 on a Firecrawl cache hit and on a 404 page).
 */

export type UsageReason =
  | "charged"
  | "cached"
  | "error"
  | "no_document"
  | "archive"
  | "timeout_assumed";

export type CreditDecision = {
  credits: number;
  billable: boolean;
  reason: UsageReason;
  /** Set when a rule had to guess (e.g. Firecrawl response without `creditsUsed`). */
  warning?: string;
};

function decision(credits: number, reason: UsageReason, warning?: string): CreditDecision {
  return {
    credits,
    billable: credits > 0,
    reason,
    ...(warning ? { warning } : {}),
  };
}

// ── SerpApi ─────────────────────────────────────────────────────────────────

/** A cached result's `created_at` predates our request by more than this. */
export const SERP_CACHE_SKEW_MS = 2_000;

/** What happened to one SerpApi HTTP request. */
export type SerpOutcome =
  /** HTTP 200 — includes payloads with an `error` field (e.g. no results). */
  | { kind: "response"; payload: unknown; requestStartedAt: Date }
  /** SerpApi answered with a non-200 status. */
  | { kind: "http_error" }
  /** We gave up waiting (SDK timeout or our abort); SerpApi likely still ran it. */
  | { kind: "timeout" }
  /** Failed before reaching SerpApi (DNS, refused connection, socket error). */
  | { kind: "network_error" };

/** `search_metadata.created_at`, e.g. "2026-10-12 06:22:21 UTC". */
export function parseSerpCreatedAt(payload: unknown): Date | null {
  const meta =
    payload && typeof payload === "object"
      ? (payload as { search_metadata?: { created_at?: unknown } }).search_metadata
      : undefined;
  const raw = meta?.created_at;
  if (typeof raw !== "string") {
    return null;
  }
  const iso = raw.trim().replace(" UTC", "Z").replace(" ", "T");
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Credits for one `search` request (any engine). An AI Overview follow-up
 * (`engine=google_ai_overview` + `page_token`) is its own request and goes
 * through here too; it never adds credits to the original search.
 */
export function serpSearchCredits(outcome: SerpOutcome): CreditDecision {
  switch (outcome.kind) {
    case "response": {
      const createdAt = parseSerpCreatedAt(outcome.payload);
      if (
        createdAt &&
        createdAt.getTime() < outcome.requestStartedAt.getTime() - SERP_CACHE_SKEW_MS
      ) {
        return decision(0, "cached");
      }
      // Zero-result searches come back as 200 + `error` and are billed.
      return decision(1, "charged");
    }
    case "http_error":
    case "network_error":
      return decision(0, "error");
    case "timeout":
      return decision(1, "timeout_assumed");
  }
}

/** `getBySearchId` / search archive: free. */
export function serpArchiveCredits(): CreditDecision {
  return decision(0, "archive");
}

const SERP_TIMEOUT_MESSAGE = "The request was timed out";

/**
 * Classify what the serpapi SDK threw. Returns `null` when the request was
 * never sent (argument / validation errors) — nothing to record.
 */
export function classifySerpError(
  error: unknown,
): Exclude<SerpOutcome, { kind: "response" }> | null {
  // Non-200: the SDK rejects with the response body string.
  if (typeof error === "string") {
    return { kind: "http_error" };
  }
  if (!(error instanceof Error)) {
    return { kind: "network_error" };
  }
  if (error.message === SERP_TIMEOUT_MESSAGE || error.name === "AbortError") {
    return { kind: "timeout" };
  }
  if (
    error.name === "ZodError" ||
    error.message.startsWith("Arguments are missing") ||
    error.message.startsWith("api_key is required") ||
    error.message.startsWith("Enter a valid timeout")
  ) {
    return null;
  }
  return { kind: "network_error" };
}

/** Short error text for `detail`: SerpApi's `error` field, or the Error message. */
export function serpErrorMessage(error: unknown): string | null {
  if (typeof error !== "string") {
    return error instanceof Error ? error.message : null;
  }
  try {
    const body = JSON.parse(error) as { error?: unknown };
    return typeof body.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}

// ── Firecrawl ───────────────────────────────────────────────────────────────

/** Fallback pricing, used only when a response lacks `metadata.creditsUsed`. */
export const FIRECRAWL_FALLBACK = {
  perPage: 1,
  jsonFormat: 4,
  perPdfPage: 1,
  paidOption: 4,
  searchPerTenResults: 2,
  map: 1,
} as const;

/** Options that matter for fallback pricing (subset of the SDK's ScrapeOptions). */
export type FirecrawlScrapeOptionsForCredits = {
  formats?: ReadonlyArray<string | { type?: string }>;
  proxy?: string;
};

type FirecrawlDocumentLike = {
  markdown?: unknown;
  html?: unknown;
  rawHtml?: unknown;
  json?: unknown;
  metadata?: {
    creditsUsed?: unknown;
    contentType?: unknown;
    numPages?: unknown;
    proxyUsed?: unknown;
  } | null;
};

function asDocument(value: unknown): FirecrawlDocumentLike | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const doc = value as FirecrawlDocumentLike;
  const hasContent =
    doc.markdown != null || doc.html != null || doc.rawHtml != null || doc.json != null;
  return hasContent || doc.metadata ? doc : null;
}

function requestsJson(options: FirecrawlScrapeOptionsForCredits): boolean {
  return (options.formats ?? []).some((format) =>
    typeof format === "string" ? format === "json" : format?.type === "json",
  );
}

function usesPaidOption(
  options: FirecrawlScrapeOptionsForCredits,
  doc: FirecrawlDocumentLike,
): boolean {
  const proxy = options.proxy ?? doc.metadata?.proxyUsed;
  return proxy === "stealth" || proxy === "enhanced";
}

function pdfPages(doc: FirecrawlDocumentLike): number {
  const contentType = doc.metadata?.contentType;
  const pages = doc.metadata?.numPages;
  const isPdf = typeof contentType === "string" && contentType.includes("pdf");
  return isPdf && typeof pages === "number" && pages > 0 ? Math.floor(pages) : 0;
}

/**
 * Credits for one scrape. `response` is what the SDK resolved with, or
 * `undefined` if it threw. Uses `metadata.creditsUsed` whenever present.
 */
export function firecrawlScrapeCredits(
  response: unknown,
  options: FirecrawlScrapeOptionsForCredits = {},
): CreditDecision {
  const doc = asDocument(response);
  if (!doc) {
    return decision(0, "no_document");
  }

  const reported = doc.metadata?.creditsUsed;
  if (typeof reported === "number" && Number.isFinite(reported) && reported >= 0) {
    return decision(Math.round(reported), "charged");
  }

  // Fallback — a document came back, even for a 403/404 page.
  let credits = FIRECRAWL_FALLBACK.perPage;
  if (requestsJson(options)) credits += FIRECRAWL_FALLBACK.jsonFormat;
  credits += pdfPages(doc) * FIRECRAWL_FALLBACK.perPdfPage;
  if (usesPaidOption(options, doc)) credits += FIRECRAWL_FALLBACK.paidOption;
  return decision(
    credits,
    "charged",
    "Firecrawl response had no metadata.creditsUsed; used fallback pricing",
  );
}

/** Not used by the app today; here so search can be tracked if it's adopted. */
export function firecrawlSearchCredits(input: {
  resultCount: number;
  scrapedResults?: unknown[];
  options?: FirecrawlScrapeOptionsForCredits;
}): CreditDecision {
  const searchCredits =
    Math.ceil(Math.max(0, input.resultCount) / 10) * FIRECRAWL_FALLBACK.searchPerTenResults;
  const scrapes = (input.scrapedResults ?? []).map((doc) =>
    firecrawlScrapeCredits(doc, input.options),
  );
  const credits = scrapes.reduce((sum, s) => sum + s.credits, searchCredits);
  const warning = scrapes.find((s) => s.warning)?.warning;
  return decision(credits, credits > 0 ? "charged" : "no_document", warning);
}

/** Not used by the app today: crawl bills each page like a scrape. */
export function firecrawlCrawlCredits(
  pages: unknown[],
  options?: FirecrawlScrapeOptionsForCredits,
): CreditDecision {
  const scrapes = pages.map((page) => firecrawlScrapeCredits(page, options));
  const credits = scrapes.reduce((sum, s) => sum + s.credits, 0);
  const warning = scrapes.find((s) => s.warning)?.warning;
  return decision(credits, credits > 0 ? "charged" : "no_document", warning);
}

/** Not used by the app today: map is a flat 1 per call. */
export function firecrawlMapCredits(): CreditDecision {
  return decision(FIRECRAWL_FALLBACK.map, "charged");
}
