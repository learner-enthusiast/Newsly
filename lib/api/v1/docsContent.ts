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
      "Expanded narrative docs: endpoint map, product flows, local Inngest dev, troubleshooting.",
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
The **Newsly REST API** is how server-side apps, scripts and integrations call the same product features you use in the browser: **news briefings**, a **public story feed**, **Indian instrument search**, **async research reports** (stock / ETF / mutual fund), and **email newsletters**. Everything is **JSON over HTTPS**, versioned under \`/api/v1\`, and authenticated with **per-account API keys**.

> **Requires Pro.** Every \`/api/v1\` route checks an API key tied to an account on an **active Pro plan**. Create keys at **Settings → Developers** (or \`${input.baseUrl}/settings/developers\`). If Pro lapses, keys return \`403 plan_required\` until billing is fixed — keys are **not** deleted.

## How the API fits together

Think of three layers:

1. **Your integration** — sends \`Authorization: Bearer ds_live_…\`, optional \`Idempotency-Key\` on pipeline POSTs, optional \`X-Request-Id\` for support.
2. **The HTTP API** — validates the key, scopes, rate limits and quotas; returns JSON (or **202** + a **job** for long work).
3. **Background pipelines** — briefings and research run on **Inngest** (same as the web app). The API exposes **jobs** and optional **webhooks** so you do not have to keep an HTTP connection open for minutes.

**Sync vs async (read this once)**

| Kind | What happens | Typical latency | Counts toward daily pipeline quota? |
| --- | --- | --- | --- |
| **Read / search** | Handler reads the database and responds | Usually &lt; 1 s | No — only the per-minute rate limit |
| **Pipeline** | Handler enqueues work, returns a **job** immediately | Job finishes in ~1–5+ min | Yes — each **accepted** briefing or research POST (not dedupe 200) |

**Resource ownership.** Lists and GET-by-id only return **your account's** briefings, research, newsletters and jobs. Public **stories** are readable with \`news:read\` but are not "owned" by you — they are curated feed items. **Instruments** search is global reference data.

**Same rules as the app.** Briefing dedupe (one slot per date + scope + location), newsletter limits, story counts, and pipeline behavior match the UI. If something works in the app with your account, the API should behave the same with a key that has the right scopes.

## Endpoint map

Base URL for examples below: \`${api}\`. Paths in the sidebar match these exactly.

| Area | Method & path | Scope(s) | Sync? | What you get |
| --- | --- | --- | --- | --- |
| Account | \`GET /me\` | any key | Yes | Plan, limits, today's pipeline usage, key metadata |
| Stories | \`GET /stories\`, \`GET /stories/{id}\` | \`news:read\` | Yes | Public story feed (newest \`publishedAt\` first) |
| Briefings | \`GET /news/briefings\`, \`GET /news/briefings/{id}\` | \`news:read\` | Yes | Your briefings; \`stories\` filled when succeeded |
| Briefings | \`POST /news/briefings\` | \`news:write\` | **Async** → job | Starts briefing pipeline; **202** or dedupe **200** |
| Research | \`GET /research/reports\`, \`GET /research/reports/{id}\` | \`research:read\` | Yes | Your reports; \`reportMarkdown\` when done |
| Research | \`POST /research/reports\` | \`research:write\` | **Async** → job | Starts research pipeline; **202** |
| Jobs | \`GET /jobs/{id}\` | \`news:read\` *or* \`research:read\` (by job type) | Yes | Live job status + \`resource.url\` when succeeded |
| Instruments | \`GET /instruments/search?q=\` | \`instruments:read\` | Yes | Stocks, ETFs, mutual funds — use \`instrumentKey\` for research |
| Newsletters | \`GET/POST /newsletters\`, \`GET/PATCH/DELETE /newsletters/{id}\` | read / write | Yes | CRUD on digests sent to **account email** |
| Newsletters | \`POST /newsletters/{id}/pause\`, \`…/resume\` | \`newsletters:write\` | Yes | Pause or resume scheduled sends |

OpenAPI (all request/response fields): [\`${api}/openapi.json\`](${api}/openapi.json). Interactive try-it UI: [\`${input.baseUrl}/docs/api\`](${input.baseUrl}/docs/api).

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

**Minimal checklist after your first request**

1. \`GET /me\` → confirm \`plan: "pro"\`, scopes you need, and \`usage.pipelineJobsToday\` vs \`limits.pipelineJobsPerDay\`.
2. \`POST /news/briefings\` → note the job \`id\` and \`Location\` header (\`/jobs/{id}\`).
3. \`GET /jobs/{id}\` every 5–10 s until \`status\` is \`succeeded\` or \`failed\`.
4. \`GET\` the \`resource.url\` from the job (same host, same Bearer token) → read \`stories\`.

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

**Choosing scopes when creating a key**

| If you want to… | Include at least |
| --- | --- |
| Poll briefing jobs and read briefings / stories | \`news:read\` + \`news:write\` to create |
| Run research end-to-end | \`instruments:read\` + \`research:read\` + \`research:write\` |
| Manage newsletters only | \`newsletters:read\` + \`newsletters:write\` |
| Read-only dashboard | Default set on the Developers page (read scopes + instrument search) |

Write scopes are required for **POST** pipeline endpoints; missing scope → \`403\` with \`details.requiredScope\`.

## Product flows (step by step)

### Flow A — World news briefing

1. **POST** \`/news/briefings\` with body e.g. \`{ "scope": "world", "storyCount": 5, "categories": ["markets"] }\`.
2. Response **202** → JSON **job** (\`id\`, \`status: "pending"\`, \`type: "briefing"\`).
3. **GET** \`/jobs/{id}\` until \`status === "succeeded"\` (or handle \`failed\` + \`error\` on the job).
4. **GET** \`job.resource.url\` (typically \`/news/briefings/{briefingId}\`) → briefing object with \`stories[]\` (title, summary, sources, etc.).

Optional: set \`webhookUrl\` on the POST body to receive \`job.succeeded\` / \`job.failed\` instead of polling.

**Local briefing** — use \`scope: "local"\` or \`"both"\` and a \`location\` string (e.g. \`"Hyderabad, Telangana, India"\`). You may also pass \`latitude\`, \`longitude\`, and \`radius\` (meters) for geo-filtered news.

### Flow B — Stock / ETF / mutual fund research

1. **GET** \`/instruments/search?q=Reliance\` (or symbol/name) → pick an item's \`instrumentKey\` and \`assetType\`.
2. **POST** \`/research/reports\` with \`{ "assetType": "STOCK", "instrumentKey": "…", "prompt": "Your question…" }\`.
3. Poll **GET** \`/jobs/{id}\` (needs \`research:read\`) until succeeded.
4. **GET** \`/research/reports/{id}\` → \`reportMarkdown\` and metadata.

Research jobs may show \`running\` while the model and data pipeline work; briefing jobs usually go \`pending\` → \`succeeded\` | \`failed\`.

### Flow C — Public story feed (no pipeline)

1. **GET** \`/stories?limit=20\` with \`news:read\`.
2. Use \`nextCursor\` from the response as \`?cursor=\` for the next page.
3. **GET** \`/stories/{id}\` for full body content of one story.

Stories come from successful briefings and published community content; they are **not** created via a separate POST on the public API.

### Flow D — Newsletters

1. **POST** \`/newsletters\` with schedule, scope, categories, etc. (see OpenAPI \`NewsletterCreate\`).
2. Digests send to the **Clerk primary email** on the same account as the API key.
3. **PATCH** to change settings; **POST** \`…/pause\` or \`…/resume\`; **DELETE** to remove.
4. **GET** \`/newsletters/{id}\` includes recent delivery records.

Newsletter POSTs are **synchronous** (201 immediately) but **scheduled sends** still run on background workers — same as the web UI.

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

**Job object fields (mental model)**

- \`id\` — use for polling \`GET /jobs/{id}\` and for webhook \`X-DS-Delivery\`.
- \`status\` — always reflects the underlying briefing or report row (not a cached snapshot).
- \`resource\` — when succeeded, \`resource.url\` is a **path** under \`/api/v1\` you can GET with the same Bearer token.
- \`deduplicated\` — \`true\` on **200** briefing responses when we returned an existing job for identical parameters.
- \`webhook\` — delivery state when you passed \`webhookUrl\` (\`pending\`, \`delivered\`, \`failed\`, \`expired\`).

**Research vs briefing on \`GET /jobs/{id}\`**

The job id is opaque. If you call \`GET /jobs/{id}\` without the scope for that job type, you get \`403 forbidden\`. Use the scope that matches how you created the job, or grant both read scopes on the key.

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

**Common mistakes**

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| \`401 unauthorized\` | Wrong token, revoked key, expired key | Create a new key; check \`Authorization: Bearer\` spelling |
| \`403 plan_required\` | Account not on Pro | Upgrade at \`/pricing\` |
| \`403 forbidden\` + \`requiredScope\` | Key missing write/read scope | Recreate key with scopes from the table above |
| \`404 not_found\` on job | Wrong id or job belongs to another account | Use the id from your POST response |
| \`409 conflict\` on briefing | Same date/scope/location, different body | Change parameters or fetch \`details.existingBriefingId\` |
| \`422 idempotency_key_reused\` | Same Idempotency-Key, different JSON | Use a fresh key per distinct request |
| \`429 rate_limited\` | &gt; ${limits.requestsPerMinute} requests/min on this key | Back off using \`Retry-After\` |
| \`429 quota_exceeded\` | Daily pipeline cap | Wait until UTC midnight (\`details.resetsAt\`) |
| Job stuck \`pending\` long time | Local dev: Inngest worker not running | Run \`pnpm inngest:dev\` (see below) |
| \`invalid_request\` on briefing | \`location\` missing for local/both, or set for world | Match scope rules in OpenAPI |

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

## Local development & testing

**From the browser (fastest sanity check)**

1. Log in as a **Pro** user → **Settings → Developers** → create a key (copy once).
2. Open **[\`/docs/api\`](${input.baseUrl}/docs/api)** → Authorize with \`Bearer ds_live_…\`.
3. Run **\`GET /me\`**, then try **\`GET /instruments/search\`** or a small **\`POST /news/briefings\`**.

**From curl / your app**

Point \`DS_API_KEY\` at your local or deployed origin, e.g. \`http://localhost:3000\` during \`pnpm dev\`. All paths remain \`/api/v1/…\`.

**Background jobs on localhost**

Briefings and research **do not complete** unless **Inngest** is processing events:

- Terminal 1: \`pnpm dev\` (Next.js).
- Terminal 2: \`pnpm inngest:dev\` (dev server + connect to your app).

In **production**, set Inngest Cloud env vars (\`INNGEST_SIGNING_KEY\`, \`INNGEST_EVENT_KEY\`, etc. — see \`.env.example\`) so workers run without a local dev daemon.

**Webhooks on localhost**

Public \`https\` URLs are required. Use a tunnel (ngrok, Cloudflare Tunnel) and paste the HTTPS URL into \`webhookUrl\`. Verify signatures with the **Webhook signing secret** on the Developers page.

**Logs**

Send \`X-Request-Id: your-correlation-id\` on requests; error JSON includes the same \`requestId\` for support.

## Versioning

The version is in the path (\`/api/v1\`). Within v1 we only make additive changes: new endpoints, new optional parameters, new response fields and new error \`code\`s. Ignore unknown fields. Breaking changes ship as \`/api/v2\`, announced here with at least 3 months of overlap. The machine-readable contract is [\`/api/v1/openapi.json\`](${api}/openapi.json) (OpenAPI 3.1).

## Changelog

${changelog()}
`.trim();
}
