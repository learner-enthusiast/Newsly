/**
 * Print the span tree of one run from the local span log written when the app
 * runs with `NEATLOGS_LOCAL_SPAN_LOG=<file>`, and scan it for secrets / emails.
 *
 * Usage: pnpm trace:print -- --file spans.jsonl (--trace <traceId> | --run <runId>)
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

type SpanRecord = {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  kind: string;
  start_time: number;
  duration_ns: number | null;
  status?: { code?: string; description?: string | null };
  attributes: Record<string, unknown>;
};

const { values } = parseArgs({
  options: {
    file: { type: "string" },
    trace: { type: "string" },
    run: { type: "string" },
    width: { type: "string", default: "160" },
  },
});

const width = Number(values.width);

function short(value: unknown): string {
  if (value == null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const flat = text.replace(/\s+/g, " ");
  return flat.length > width ? `${flat.slice(0, width)}… (${flat.length} chars)` : flat;
}

function attr(span: SpanRecord, suffix: string): unknown {
  const key = Object.keys(span.attributes).find((k) => k.endsWith(suffix));
  return key ? span.attributes[key] : undefined;
}

function main() {
  if (!values.file || (!values.trace && !values.run)) {
    throw new Error("Pass --file and --trace or --run");
  }
  const all = readFileSync(values.file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SpanRecord);

  const traceId =
    values.trace ??
    all.find((span) => span.attributes["run.id"] === values.run)?.trace_id;
  if (!traceId) throw new Error("No span found for that run");
  const spans = all
    .filter((span) => span.trace_id === traceId)
    .sort((a, b) => a.start_time - b.start_time);

  const ids = new Set(spans.map((span) => span.span_id));
  const children = new Map<string | null, SpanRecord[]>();
  for (const span of spans) {
    const parent = span.parent_span_id && ids.has(span.parent_span_id) ? span.parent_span_id : null;
    children.set(parent, [...(children.get(parent) ?? []), span]);
  }

  const t0 = spans[0]?.start_time ?? 0;
  console.log(`trace ${traceId} — ${spans.length} spans`);
  const print = (span: SpanRecord, depth: number) => {
    const pad = "  ".repeat(depth);
    const ms = span.duration_ns != null ? Math.round(span.duration_ns / 1e6) : null;
    const at = Math.round((span.start_time - t0) / 1e6);
    const status = span.attributes["run.status"] ?? span.status?.code ?? "";
    const runId = span.attributes["run.id"] ?? "";
    const tokens = span.attributes["neatlogs.llm.token_count.total"] ?? span.attributes["run.tokens.input"];
    const cost = span.attributes["run.cost_usd"];
    console.log(
      `${pad}${String(span.kind).toUpperCase()} ${span.name}  +${at}ms  ${ms}ms  status=${status}` +
        (runId ? `  runId=${String(runId).slice(0, 8)}` : "") +
        (tokens != null ? `  tokens=${String(tokens)}` : "") +
        (cost != null ? `  cost=$${Number(cost).toFixed(5)}` : ""),
    );
    const endUser = span.attributes["neatlogs.end_user.id"];
    if (endUser) console.log(`${pad}  endUser=${String(endUser)}`);
    const tags = span.attributes["neatlogs.tags"];
    if (tags) console.log(`${pad}  tags=${short(tags)}`);
    const input = attr(span, ".input") ?? span.attributes["input.value"];
    const output = attr(span, ".output") ?? span.attributes["output.value"];
    if (input) console.log(`${pad}  in : ${short(input)}`);
    if (output) console.log(`${pad}  out: ${short(output)}`);
    const error = span.attributes["error.message"] ?? span.status?.description;
    if (error) console.log(`${pad}  err: ${short(error)}`);
    for (const child of children.get(span.span_id) ?? []) print(child, depth + 1);
  };
  for (const root of children.get(null) ?? []) print(root, 0);

  // Secret / PII scan over every exported field of this trace.
  const blob = JSON.stringify(spans);
  const secretValues = Object.entries(process.env)
    .filter(([key, value]) => /KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL/i.test(key) && value && value.length >= 12)
    .map(([key, value]) => ({ key, value: value! }));
  const leakedSecrets = secretValues.filter(({ value }) => blob.includes(value)).map(({ key }) => key);
  const emails = [...new Set(blob.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [])];
  const bearer = /Bearer\s+(?!\[redacted\])[A-Za-z0-9._-]{12,}/.test(blob);
  const apiKeyParam = /api_key=(?!\[redacted\])[^&"\s]{8,}/.test(blob);
  console.log("\nsecret scan:", {
    envSecretsFound: leakedSecrets,
    emailsFound: emails,
    bearerTokenFound: bearer,
    apiKeyParamFound: apiKeyParam,
  });
}

main();
