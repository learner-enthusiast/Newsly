/**
 * Narrative documentation of the public API, rendered by Scalar from the
 * OpenAPI `info.description` (each `##` heading becomes a sidebar entry).
 * Limits and scopes come from the same constants the server enforces.
 */

import { API_ERROR_CODES, API_ERROR_STATUS, type ApiErrorCode } from "@/lib/api/v1/errors";
import type { ApiPlanLimits } from "@/lib/api/v1/limits";
import { API_SCOPE_DESCRIPTIONS, API_SCOPES } from "@/lib/api/v1/scopes";

export const API_VERSION = "1.0.0";

export const API_CHANGELOG: { date: string; version: string; notes: string[] }[] = [
  {
    date: "2026-10-12",
    version: "1.0.0",
    notes: [
      "First public release: stories, briefings, research reports, instrument search, newsletters.",
      "Async jobs for briefings and research, with signed webhooks.",
    ],
  },
];

export const ERROR_DESCRIPTIONS: Record<ApiErrorCode, string> = {
  invalid_request: "Validation failed. `details.fields` lists each problem (`in`, `path`, `message`).",
  unauthorized: "Missing, malformed, unknown, revoked or expired key.",
  plan_required: "The key's account is not on an active Pro plan. Keys work again as soon as Pro is renewed.",
  forbidden: "The key lacks the scope the endpoint needs (`details.requiredScope`).",
  not_found: "No such resource, or it isn't yours. Malformed ids also answer 404.",
  method_not_allowed: "The path exists but not with this HTTP method.",
  conflict:
    "The request clashes with existing state: a briefing with different parameters (`details.existingBriefingId`), or an Idempotency-Key whose first request is still running.",
  idempotency_key_reused: "The Idempotency-Key was already used with a different request body or path.",
  payload_too_large: "Request body over 64 KB.",
  unsupported_media_type: "Bodies must be JSON with `Content-Type: application/json`.",
  limit_reached: "An account limit was reached (e.g. the maximum number of newsletters).",
  rate_limited: "Too many requests for this key in the last minute. Wait `Retry-After` seconds.",
  quota_exceeded: "Daily pipeline quota used up. It resets at 00:00 UTC (`Retry-After`, `details.resetsAt`).",
  internal_error: "Unexpected server error. Retry with backoff; quote the `requestId` if it persists.",
};

function scopesTable(): string {
  return [
    "| Scope | Grants |",
    "| --- | --- |",
    ...API_SCOPES.map((scope) => `| \`${scope}\` | ${API_SCOPE_DESCRIPTIONS[scope]} |`),
  ].join("\n");
}

function errorsTable(): string {
  return [
    "| HTTP | `code` | Meaning |",
    "| --- | --- | --- |",
    ...API_ERROR_CODES.map(
      (code) => `| ${API_ERROR_STATUS[code]} | \`${code}\` | ${ERROR_DESCRIPTIONS[code]} |`,
    ),
  ].join("\n");
}

function changelog(): string {
  return API_CHANGELOG.map(
    (entry) => `**${entry.version}** — ${entry.date}\n\n${entry.notes.map((n) => `- ${n}`).join("\n")}`,
  ).join("\n\n");
}

export function apiDocsMarkdown(input: { baseUrl: string; limits: ApiPlanLimits }): string {
  const api = `${input.baseUrl}/api/v1`;
  const { limits } = input;
  return `
The Dainik Samachar API gives your code the same briefings, research reports, instrument search and newsletters as the app. JSON over HTTPS, one version (\`/api/v1\`), keys per account.

> **Requires Pro.** Every endpoint needs an API key from an account on an active Pro plan. Create keys under **Settings → Developers**. If the plan lapses, keys answer \`403 plan_required\` until Pro is renewed; they are not deleted.

## Quickstart

1. Upgrade to Pro and create a key on the Developers page. Copy it — it is shown once.
2. Call \`GET /me\` to check the key, its scopes and your quota.
3. Start a briefing, then poll its job (or pass a \`webhookUrl\`).

**curl**

\`\`\`bash
export DS_API_KEY="ds_live_..."

curl ${api}/me -H "Authorization: Bearer $DS_API_KEY"

curl -X POST ${api}/news/briefings \\
  -H "Authorization: Bearer $DS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{"scope":"world","storyCount":5,"categories":["markets"]}'
# → 202 { "id": "<job id>", "status": "pending", ... }

curl ${api}/jobs/<job id> -H "Authorization: Bearer $DS_API_KEY"
\`\`\`

**JavaScript (Node 18+)**

\`\`\`js
const API = "${api}";
const headers = {
  Authorization: \`Bearer \${process.env.DS_API_KEY}\`,
  "Content-Type": "application/json",
};

const res = await fetch(\`\${API}/news/briefings\`, {
  method: "POST",
  headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
  body: JSON.stringify({ scope: "world", storyCount: 5 }),
});
let job = await res.json();
while (job.status === "pending" || job.status === "running") {
  await new Promise((r) => setTimeout(r, 10_000));
  job = await (await fetch(\`\${API}/jobs/\${job.id}\`, { headers })).json();
}
const briefing = await (await fetch(job.resource.url, { headers })).json();
console.log(briefing.stories.map((s) => s.title));
\`\`\`

**Python**

\`\`\`python
import os, time, uuid, requests

API = "${api}"
s = requests.Session()
s.headers["Authorization"] = f"Bearer {os.environ['DS_API_KEY']}"

job = s.post(f"{API}/news/briefings",
             json={"scope": "world", "storyCount": 5},
             headers={"Idempotency-Key": str(uuid.uuid4())}).json()
while job["status"] in ("pending", "running"):
    time.sleep(10)
    job = s.get(f"{API}/jobs/{job['id']}").json()
print([story["title"] for story in s.get(job["resource"]["url"]).json()["stories"]])
\`\`\`

## Authentication & scopes

Send the key as a Bearer token on every request:

\`\`\`
Authorization: Bearer ds_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
\`\`\`

Only a SHA-256 of the key is stored; a lost key can't be recovered — revoke it and create another. Keys can expire (30/90/365 days or never) and can be revoked at any time on the Developers page; both answer \`401\`.

Each key carries scopes chosen at creation. A missing scope answers \`403 forbidden\` with \`details.requiredScope\`.

${scopesTable()}

\`GET /me\` works with any scope. \`GET /jobs/{id}\` needs \`news:read\` for briefing jobs and \`research:read\` for research jobs.

## Async jobs

Briefings and research reports take from under a minute to a few minutes, so their \`POST\` answers **202 Accepted** with a **job** and a \`Location\` header pointing at \`GET /jobs/{id}\`.

- \`status\`: \`pending\` → \`running\` (research only) → \`succeeded\` | \`failed\`. It is read live from the briefing or report, so it is never stale.
- \`resource.url\` is the briefing or report to fetch once the job has succeeded.
- Poll every 5–10 seconds, or pass \`webhookUrl\` and get one call when it finishes.

**Briefing dedupe.** There is one briefing per account, date, scope and location (the same rule as the app):

| You send | Answer |
| --- | --- |
| A new date/scope/location | \`202\`, new job, counts toward quota |
| Exactly the same parameters as an existing briefing | \`200\` with that briefing's job, \`"deduplicated": true\`, no quota used |
| Same date/scope/location, different parameters | \`409 conflict\` with \`details.existingBriefingId\` |
| Same slot, but the earlier briefing failed | \`202\`, the briefing is retried |

## Webhooks

Pass an \`https\` \`webhookUrl\` when creating a job. When the job succeeds or fails we \`POST\` once:

\`\`\`json
{
  "id": "<job id>",
  "type": "job.succeeded",
  "createdAt": "2026-10-12T06:34:10.000Z",
  "data": { "job": { "id": "<job id>", "status": "succeeded", "resource": { "...": "..." } } }
}
\`\`\`

Headers: \`X-DS-Event\` (\`job.succeeded\` | \`job.failed\`), \`X-DS-Delivery\` (the job id — use it to ignore duplicates), \`X-DS-Timestamp\` (unix seconds), \`X-DS-Signature\`.

- Answer with any 2xx within 10 seconds. Other answers, timeouts and connection errors are retried 3 times with backoff, then the job's \`webhook.status\` becomes \`failed\`.
- We watch a job for up to 30 minutes; one still running then gets \`webhook.status: "expired"\` and no call — poll it instead.
- URLs must be \`https\` and resolve to public addresses (private, loopback and link-local ranges are refused). Redirects are not followed.

**Verifying the signature.** \`X-DS-Signature\` is \`v1=\` + hex HMAC-SHA256 of \`"<timestamp>.<raw body>"\` keyed with your **webhook signing secret** (Developers page → Webhook signing secret; rotatable). Use the raw request body, compare in constant time and reject timestamps older than 5 minutes.

\`\`\`js
// Node
import crypto from "node:crypto";

export function verifyDsWebhook(rawBody, headers, secret) {
  const ts = headers["x-ds-timestamp"];
  const sig = headers["x-ds-signature"] ?? "";
  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = "v1=" + crypto.createHmac("sha256", secret).update(\`\${ts}.\${rawBody}\`).digest("hex");
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
\`\`\`

\`\`\`python
# Python
import hmac, hashlib, time

def verify_ds_webhook(raw_body: bytes, headers, secret: str) -> bool:
    ts = headers.get("X-DS-Timestamp", "")
    sig = headers.get("X-DS-Signature", "")
    if not ts.isdigit() or abs(time.time() - int(ts)) > 300:
        return False
    mac = hmac.new(secret.encode(), f"{ts}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, "v1=" + mac)
\`\`\`

## Errors

Every error has the same shape; \`requestId\` matches the \`X-Request-Id\` response header (send your own \`X-Request-Id\` to correlate logs).

\`\`\`json
{ "error": { "code": "invalid_request", "message": "Request validation failed.",
  "details": { "fields": [{ "in": "body", "path": "storyCount", "message": "Too big: expected number to be <=12" }] },
  "requestId": "req_8f2c1d9e4b7a4c3e" } }
\`\`\`

${errorsTable()}

Switch on \`code\`, not on \`message\`; messages may be reworded.

## Plans & limits

| | Pro |
| --- | --- |
| Requests per key per minute | ${limits.requestsPerMinute} |
| Pipeline jobs per account per UTC day (briefings + research) | ${limits.pipelineJobsPerDay} |
| Active keys per account | ${limits.maxActiveKeys} |
| Request body | 64 KB |

Every authenticated response carries \`X-RateLimit-Limit\`, \`X-RateLimit-Remaining\` and \`X-RateLimit-Reset\` (unix seconds). The per-minute limit is a sliding window; a \`429 rate_limited\` carries \`Retry-After\`. Only accepted pipeline jobs count toward the daily quota — validation errors, deduplicated briefings and idempotent replays don't. \`GET /me\` shows today's usage.

## Pagination

Lists return \`{ "data": [...], "nextCursor": "..." | null }\`. Pass \`nextCursor\` back as \`?cursor=\` (with the same filters) for the next page; \`null\` means the end. Cursors are opaque — don't build or parse them. \`limit\` is 1–50 (default 20). Stories are ordered by \`publishedAt\` then \`id\`, newest first; other lists by creation time.

## Idempotency

\`POST /news/briefings\` and \`POST /research/reports\` accept an \`Idempotency-Key\` header (1–255 printable ASCII characters; a UUID is ideal). For 24 hours:

- the same key with the same request returns the original response again, with \`Idempotent-Replayed: true\` — no second job, no quota;
- the same key with a different request answers \`422 idempotency_key_reused\`;
- the same key while the first request is still being processed answers \`409 conflict\`.

Only successful responses are stored, so a request that failed (4xx/5xx) can be retried with the same key.

## Versioning

The version is in the path (\`/api/v1\`). Within v1 we only make additive changes: new endpoints, new optional parameters, new response fields and new error \`code\`s. Ignore unknown fields. Breaking changes ship as \`/api/v2\`, announced here with at least 3 months of overlap. The machine-readable contract is [\`/api/v1/openapi.json\`](${api}/openapi.json) (OpenAPI 3.1).

## Changelog

${changelog()}
`.trim();
}
