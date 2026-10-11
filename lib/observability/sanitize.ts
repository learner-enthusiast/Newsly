/**
 * Span payload hygiene: redact secrets / PII and clip to a fixed size before
 * anything is attached to a Neatlogs span.
 */

export const SPAN_PAYLOAD_MAX_CHARS = 4_000;

const MAX_DEPTH = 8;
const MAX_ARRAY_ITEMS = 50;

/** Object keys whose values are never logged. */
const SECRET_KEY =
  /^(api[_-]?key|apikey|authorization|auth|access[_-]?token|refresh[_-]?token|token|secret|client[_-]?secret|password|cookie|set-cookie|email|e-?mail[_-]?address|first[_-]?name|last[_-]?name|full[_-]?name|phone)$/i;

const SECRET_QUERY_PARAM =
  /([?&](?:api_key|apikey|key|token|access_token|auth)=)[^&\s"']+/gi;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function redactString(value: string): string {
  const head =
    value.length > SPAN_PAYLOAD_MAX_CHARS * 2
      ? value.slice(0, SPAN_PAYLOAD_MAX_CHARS * 2)
      : value;
  return head
    .replace(SECRET_QUERY_PARAM, "$1[redacted]")
    .replace(BEARER, "$1 [redacted]")
    .replace(EMAIL, "[email]");
}

/** Deep copy with secret keys, bearer tokens, key query params and emails removed. */
export function redact(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return redactString(value);
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) };
  }
  if (depth >= MAX_DEPTH) {
    return "[depth limit]";
  }
  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => redact(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`[+${value.length - MAX_ARRAY_ITEMS} more]`);
    }
    return items;
  }
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY.test(key) ? "[redacted]" : redact(inner, depth + 1);
  }
  return out;
}

export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "null";
  } catch {
    return String(value);
  }
}

/**
 * Redacted value, or a `{ clipped, originalLength, preview }` stand-in when its
 * JSON is longer than {@link SPAN_PAYLOAD_MAX_CHARS}.
 */
export function clipForSpan(value: unknown): unknown {
  const redacted = redact(value);
  const json = safeStringify(redacted);
  if (json.length <= SPAN_PAYLOAD_MAX_CHARS) {
    return redacted;
  }
  return {
    clipped: true,
    originalLength: json.length,
    preview: json.slice(0, SPAN_PAYLOAD_MAX_CHARS),
  };
}
