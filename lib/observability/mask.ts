/**
 * Export-boundary mask passed to `init({ mask })`: runs on every span right
 * before it leaves the process.
 *
 * - Redacts secrets and PII in every string attribute: `api_key` / token query
 *   params, Authorization / Bearer values, secret-looking JSON fields, emails
 *   and person-name fields.
 * - Clips span inputs / outputs to ~4 KB (noting the original length), except
 *   on LLM spans, whose full prompts stay available for debugging.
 * - With `NEATLOGS_LOCAL_SPAN_LOG=<file>` (dev), appends the final span to a
 *   JSONL file for `pnpm trace:print`.
 *
 * Must never throw: the SDK drops a span whose mask fails.
 */

import { appendFileSync } from "node:fs";

export const SPAN_PAYLOAD_MAX_CHARS = 4_000;

const SECRET_QUERY_PARAM =
  /([?&](?:api_key|apikey|key|token|access_token|auth)=)[^&\s"'\\]+/gi;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g;
const SECRET_JSON_FIELD =
  /("(?:api_?key|apikey|authorization|access_?token|refresh_?token|token|secret|client_?secret|password|cookie|set-cookie|email|first_?name|last_?name|full_?name|phone)"\s*:\s*)"[^"]*"/gi;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?!png\b|jpe?g\b|gif\b|webp\b|svg\b)[A-Za-z]{2,}/g;

/** Attribute keys holding a span's input / output payload. */
const PAYLOAD_KEY = /(^|\.)(input|output)(\.value)?$|^tool\.parameters$/;

export function redactText(value: string): string {
  return value
    .replace(SECRET_QUERY_PARAM, "$1[redacted]")
    .replace(BEARER, "$1 [redacted]")
    .replace(SECRET_JSON_FIELD, '$1"[redacted]"')
    .replace(EMAIL, "[email]");
}

export function clipText(value: string): string {
  if (value.length <= SPAN_PAYLOAD_MAX_CHARS) return value;
  return `${value.slice(0, SPAN_PAYLOAD_MAX_CHARS)}… [clipped, original ${value.length} chars]`;
}

function maskValue(value: unknown, clip: boolean): unknown {
  if (typeof value === "string") {
    const redacted = redactText(value);
    return clip ? clipText(redacted) : redacted;
  }
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? redactText(item) : item));
  }
  return value;
}

type SpanData = {
  kind?: unknown;
  attributes?: Record<string, unknown>;
  events?: Array<{ attributes?: Record<string, unknown> }>;
};

export function createNeatlogsMask(localSpanLog?: string) {
  return (signalData: Record<string, unknown>) => {
    try {
      const data = signalData as SpanData;
      const isLlm = String(data.kind ?? "").toUpperCase() === "LLM";
      if (data.attributes) {
        for (const [key, value] of Object.entries(data.attributes)) {
          data.attributes[key] = maskValue(value, !isLlm && PAYLOAD_KEY.test(key));
        }
      }
      for (const event of data.events ?? []) {
        for (const [key, value] of Object.entries(event.attributes ?? {})) {
          event.attributes![key] = maskValue(value, false);
        }
      }
      if (localSpanLog) {
        appendFileSync(localSpanLog, `${JSON.stringify(signalData)}\n`);
      }
    } catch {
      // Return the data as-is rather than dropping the span.
    }
    return signalData;
  };
}
