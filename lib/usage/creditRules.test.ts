import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  classifySerpError,
  firecrawlCrawlCredits,
  firecrawlMapCredits,
  firecrawlScrapeCredits,
  firecrawlSearchCredits,
  parseSerpCreatedAt,
  serpArchiveCredits,
  serpErrorMessage,
  serpSearchCredits,
} from "@/lib/usage/creditRules";

const START = new Date("2026-10-12T06:22:29.045Z");

function serpPayload(createdAt: string, extra: Record<string, unknown> = {}) {
  return {
    search_metadata: { id: "6acc7c9de6590e70adc052b1", status: "Success", created_at: createdAt },
    ...extra,
  };
}

describe("SerpApi", () => {
  test("parses search_metadata.created_at", () => {
    assert.equal(
      parseSerpCreatedAt(serpPayload("2026-10-12 06:22:21 UTC"))?.toISOString(),
      "2026-10-12T06:22:21.000Z",
    );
    assert.equal(parseSerpCreatedAt({}), null);
    assert.equal(parseSerpCreatedAt(serpPayload("not a date")), null);
  });

  test("successful search costs 1", () => {
    const result = serpSearchCredits({
      kind: "response",
      payload: serpPayload("2026-10-12 06:22:29 UTC", { organic_results: [{}] }),
      requestStartedAt: START,
    });
    assert.deepEqual(result, { credits: 1, billable: true, reason: "charged" });
  });

  test("zero-result search (200 + error field) still costs 1", () => {
    const result = serpSearchCredits({
      kind: "response",
      payload: serpPayload("2026-10-12 06:22:30 UTC", {
        error: "Google hasn't returned any results for this query.",
      }),
      requestStartedAt: START,
    });
    assert.deepEqual(result, { credits: 1, billable: true, reason: "charged" });
  });

  test("cached result (created_at > 2s before request start) is free", () => {
    // Live case: original created 06:22:21, identical request started 06:22:29.
    const result = serpSearchCredits({
      kind: "response",
      payload: serpPayload("2026-10-12 06:22:21 UTC"),
      requestStartedAt: START,
    });
    assert.deepEqual(result, { credits: 0, billable: false, reason: "cached" });
  });

  test("created_at within the 2s skew window counts as charged", () => {
    // Second-precision timestamp, truncated: 06:22:28 vs start 06:22:29.045.
    const result = serpSearchCredits({
      kind: "response",
      payload: serpPayload("2026-10-12 06:22:28 UTC"),
      requestStartedAt: START,
    });
    assert.equal(result.reason, "charged");
    assert.equal(result.credits, 1);
  });

  test("missing created_at counts as charged", () => {
    const result = serpSearchCredits({
      kind: "response",
      payload: { organic_results: [] },
      requestStartedAt: START,
    });
    assert.equal(result.credits, 1);
  });

  test("HTTP error and network error are free", () => {
    assert.deepEqual(serpSearchCredits({ kind: "http_error" }), {
      credits: 0,
      billable: false,
      reason: "error",
    });
    assert.deepEqual(serpSearchCredits({ kind: "network_error" }), {
      credits: 0,
      billable: false,
      reason: "error",
    });
  });

  test("client timeout is assumed billed", () => {
    assert.deepEqual(serpSearchCredits({ kind: "timeout" }), {
      credits: 1,
      billable: true,
      reason: "timeout_assumed",
    });
  });

  test("AI Overview follow-up is one extra request; the original is not charged twice", () => {
    const original = serpSearchCredits({
      kind: "response",
      payload: serpPayload("2026-10-12 06:22:29 UTC", {
        ai_overview: { page_token: "tok" },
      }),
      requestStartedAt: START,
    });
    const followUp = serpSearchCredits({
      kind: "response",
      payload: serpPayload("2026-10-12 06:22:31 UTC", { text_blocks: [] }),
      requestStartedAt: new Date("2026-10-12T06:22:30.500Z"),
    });
    assert.equal(original.credits, 1);
    assert.equal(followUp.credits, 1);
    assert.equal(original.credits + followUp.credits, 2);
  });

  test("search archive is free", () => {
    assert.deepEqual(serpArchiveCredits(), { credits: 0, billable: false, reason: "archive" });
  });

  test("classifies SDK errors", () => {
    assert.deepEqual(classifySerpError('{"error":"Invalid API key."}'), { kind: "http_error" });
    assert.deepEqual(classifySerpError(new Error("The request was timed out")), {
      kind: "timeout",
    });
    const abort = new Error("aborted");
    abort.name = "AbortError";
    assert.deepEqual(classifySerpError(abort), { kind: "timeout" });
    const reset = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
    assert.deepEqual(classifySerpError(reset), { kind: "network_error" });
    assert.equal(classifySerpError(new Error("Arguments are missing or of incorrect type")), null);
    const zod = new Error("bad params");
    zod.name = "ZodError";
    assert.equal(classifySerpError(zod), null);
  });

  test("extracts a short error message", () => {
    assert.equal(serpErrorMessage('{"error":"Invalid API key."}'), "Invalid API key.");
    assert.equal(serpErrorMessage("<html>"), null);
    assert.equal(serpErrorMessage(new Error("The request was timed out")), "The request was timed out");
  });
});

describe("Firecrawl", () => {
  test("uses metadata.creditsUsed when present", () => {
    const result = firecrawlScrapeCredits({
      markdown: "# Example",
      metadata: { creditsUsed: 1, cacheState: "hit", statusCode: 200 },
    });
    assert.deepEqual(result, { credits: 1, billable: true, reason: "charged" });
  });

  test("reported credits win over fallback options", () => {
    const result = firecrawlScrapeCredits(
      { json: {}, metadata: { creditsUsed: 5 } },
      { formats: ["json"] },
    );
    assert.equal(result.credits, 5);
    assert.equal(result.warning, undefined);
  });

  test("fallback: document for a 404 page costs 1", () => {
    const result = firecrawlScrapeCredits({ markdown: "Not found", metadata: { statusCode: 404 } });
    assert.equal(result.credits, 1);
    assert.equal(result.reason, "charged");
    assert.match(result.warning ?? "", /creditsUsed/);
  });

  test("fallback: json format costs 5", () => {
    assert.equal(
      firecrawlScrapeCredits({ json: { a: 1 }, metadata: {} }, { formats: ["markdown", "json"] })
        .credits,
      5,
    );
    assert.equal(
      firecrawlScrapeCredits({ json: {}, metadata: {} }, { formats: [{ type: "json" }] }).credits,
      5,
    );
  });

  test("fallback: +1 per PDF page", () => {
    const result = firecrawlScrapeCredits({
      markdown: "...",
      metadata: { contentType: "application/pdf", numPages: 12 },
    });
    assert.equal(result.credits, 13);
  });

  test("fallback: paid proxy adds 4", () => {
    assert.equal(
      firecrawlScrapeCredits({ markdown: "x", metadata: {} }, { proxy: "stealth" }).credits,
      5,
    );
    assert.equal(
      firecrawlScrapeCredits({ markdown: "x", metadata: { proxyUsed: "stealth" } }).credits,
      5,
    );
    assert.equal(
      firecrawlScrapeCredits({ markdown: "x", metadata: { proxyUsed: "basic" } }).credits,
      1,
    );
  });

  test("no document (SDK threw / empty) is free", () => {
    assert.deepEqual(firecrawlScrapeCredits(undefined), {
      credits: 0,
      billable: false,
      reason: "no_document",
    });
    assert.equal(firecrawlScrapeCredits({}).reason, "no_document");
    assert.equal(firecrawlScrapeCredits(null).credits, 0);
  });

  test("search: 2 per 10 results, rounded up, plus scrapes", () => {
    assert.equal(firecrawlSearchCredits({ resultCount: 1 }).credits, 2);
    assert.equal(firecrawlSearchCredits({ resultCount: 10 }).credits, 2);
    assert.equal(firecrawlSearchCredits({ resultCount: 11 }).credits, 4);
    assert.equal(firecrawlSearchCredits({ resultCount: 0 }).credits, 0);
    assert.equal(
      firecrawlSearchCredits({
        resultCount: 5,
        scrapedResults: [
          { markdown: "a", metadata: { creditsUsed: 1 } },
          { markdown: "b", metadata: { creditsUsed: 1 } },
        ],
      }).credits,
      4,
    );
  });

  test("crawl bills per page; map is 1", () => {
    const pages = [
      { markdown: "a", metadata: { creditsUsed: 1 } },
      { markdown: "b", metadata: { creditsUsed: 1 } },
      { markdown: "c", metadata: { creditsUsed: 1 } },
    ];
    assert.equal(firecrawlCrawlCredits(pages).credits, 3);
    assert.deepEqual(firecrawlMapCredits(), { credits: 1, billable: true, reason: "charged" });
  });
});
