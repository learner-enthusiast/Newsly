/**
 * OpenAPI 3.1 document of the public API, generated from `contract.ts`.
 *
 * Schemas come from zod v4 `z.toJSONSchema`: request bodies and parameters
 * in `io: "input"` mode (defaults make fields optional), responses in
 * `io: "output"`. Schemas with `.meta({ id })` become `components.schemas`
 * entries; every `$defs` reference is rewritten to point there.
 *
 * Build-safe: no database or server imports, so CI can build it.
 */

import { z } from "zod";
import { appBaseUrl } from "@/lib/api/v1/baseUrl";
import {
  COMMON_ERRORS,
  endpoints,
  type EndpointDef,
} from "@/lib/api/v1/contract";
import { API_VERSION, apiDocsMarkdown, ERROR_DESCRIPTIONS } from "@/lib/api/v1/docsContent";
import { API_ERROR_STATUS, type ApiErrorCode } from "@/lib/api/v1/errors";
import { getProApiLimits } from "@/lib/api/v1/limits";
import { errorBodySchema } from "@/lib/api/v1/schemas";

type JsonSchema = Record<string, unknown>;
type Io = "input" | "output";

export const TAGS: { name: string; description: string }[] = [
  {
    name: "Account",
    description:
      "Start here: GET /me returns plan (Pro required), rate-limit and pipeline quotas, and which scopes the key has. No scope required.",
  },
  {
    name: "Stories",
    description:
      "Read-only public feed. Stories are ordered by publishedAt (newest first). Use news:read. Does not consume pipeline quota.",
  },
  {
    name: "Briefings",
    description:
      "List and fetch your briefings (news:read). POST creates an async pipeline job (news:write, counts toward daily quota unless deduplicated 200).",
  },
  {
    name: "Research",
    description:
      "List and fetch markdown research reports (research:read). POST starts async analysis for one instrumentKey (research:write, pipeline quota).",
  },
  {
    name: "Jobs",
    description:
      "Poll GET /jobs/{id} after a 202 from briefing or research POST. Scope must match job type (news:read vs research:read). Status is live from the backing resource.",
  },
  {
    name: "Instruments",
    description:
      "Search NSE/BSE stocks, ETFs and mutual funds by name or symbol (instruments:read). Copy instrumentKey into POST /research/reports.",
  },
  {
    name: "Newsletters",
    description:
      "CRUD and pause/resume for email digests to the account primary email. Synchronous HTTP; scheduled sends run in the background. Shared limit with the web app.",
  },
];

const ERROR_EXAMPLE_MESSAGES: Record<ApiErrorCode, string> = {
  invalid_request: "Request validation failed.",
  unauthorized: "Invalid API key.",
  plan_required: "The API requires an active Pro plan. Upgrade at /pricing; your keys start working again right away.",
  forbidden: 'This key is missing the "news:write" scope.',
  not_found: "Briefing not found.",
  method_not_allowed: "Method not allowed.",
  conflict: "A briefing for this date, scope and location already exists with different parameters.",
  idempotency_key_reused: "This Idempotency-Key was already used with a different request.",
  payload_too_large: "Request body must be at most 65536 bytes.",
  unsupported_media_type: "Send the body as JSON with Content-Type: application/json.",
  limit_reached: "Maximum 5 newsletters per user",
  rate_limited: "Rate limit of 60 requests per minute exceeded. Retry after 12s.",
  quota_exceeded: "Daily quota of 50 pipeline jobs reached. It resets at 2026-10-13T00:00:00.000Z.",
  internal_error: "Something went wrong on our side. Retry later and quote the requestId if it keeps happening.",
};

const ERROR_EXAMPLE_DETAILS: Partial<Record<ApiErrorCode, unknown>> = {
  invalid_request: {
    fields: [{ in: "body", path: "storyCount", message: "Too big: expected number to be <=12" }],
  },
  forbidden: { requiredScope: "news:write" },
  conflict: { existingBriefingId: "3f6c2a1b-9d8e-4f7a-b6c5-d4e3f2a1b0c9" },
  quota_exceeded: { limit: 50, used: 50, resetsAt: "2026-10-13T00:00:00.000Z" },
};

export function errorExample(code: ApiErrorCode) {
  return {
    error: {
      code,
      message: ERROR_EXAMPLE_MESSAGES[code],
      ...(ERROR_EXAMPLE_DETAILS[code] !== undefined ? { details: ERROR_EXAMPLE_DETAILS[code] } : {}),
      requestId: "req_8f2c1d9e4b7a4c3e7d6b5a49",
    },
  };
}

/** First `.meta({ examples })` entry of a schema, if any. */
export function schemaExample(schema: z.ZodType): unknown {
  const meta = z.globalRegistry.get(schema) as { examples?: unknown[] } | undefined;
  return meta?.examples?.[0];
}

/** Rewrites `#/$defs/X` to `#/components/schemas/X` everywhere in a schema. */
function rewriteRefs(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(rewriteRefs);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      out[key] =
        key === "$ref" && typeof value === "string"
          ? value.replace(/^#\/\$defs\//, "#/components/schemas/")
          : rewriteRefs(value);
    }
    return out;
  }
  return node;
}

class SchemaCollector {
  readonly components: Record<string, JsonSchema> = {};

  /** JSON Schema for `schema`; named sub-schemas are hoisted into components. */
  convert(schema: z.ZodType, io: Io): JsonSchema {
    const raw = z.toJSONSchema(schema, {
      io,
      target: "draft-2020-12",
      unrepresentable: "any",
      reused: "inline",
    }) as JsonSchema;
    const { $schema: _ignored, $defs, ...root } = raw;
    void _ignored;
    for (const [id, def] of Object.entries(($defs ?? {}) as Record<string, JsonSchema>)) {
      const converted = rewriteRefs(def) as JsonSchema;
      const existing = this.components[id];
      if (existing && JSON.stringify(existing) !== JSON.stringify(converted)) {
        throw new Error(`OpenAPI: schema id "${id}" has two different shapes (input vs output?)`);
      }
      this.components[id] = converted;
    }
    return rewriteRefs(root) as JsonSchema;
  }
}

function parametersFor(
  schema: z.ZodType | undefined,
  location: "query" | "path",
  collector: SchemaCollector,
): JsonSchema[] {
  if (!schema) return [];
  const json = collector.convert(schema, "input");
  const properties = (json.properties ?? {}) as Record<string, JsonSchema>;
  const required = new Set((json.required ?? []) as string[]);
  return Object.entries(properties).map(([name, propSchema]) => {
    const { description, ...rest } = propSchema;
    return {
      name,
      in: location,
      required: location === "path" || required.has(name),
      ...(typeof description === "string" ? { description } : {}),
      schema: rest,
    };
  });
}

const RATE_LIMIT_HEADERS = {
  "X-Request-Id": { $ref: "#/components/headers/X-Request-Id" },
  "X-RateLimit-Limit": { $ref: "#/components/headers/X-RateLimit-Limit" },
  "X-RateLimit-Remaining": { $ref: "#/components/headers/X-RateLimit-Remaining" },
  "X-RateLimit-Reset": { $ref: "#/components/headers/X-RateLimit-Reset" },
};

function errorResponses(codes: ApiErrorCode[]): Record<string, JsonSchema> {
  const byStatus = new Map<number, ApiErrorCode[]>();
  for (const code of new Set(codes)) {
    const status = API_ERROR_STATUS[code];
    byStatus.set(status, [...(byStatus.get(status) ?? []), code]);
  }
  const out: Record<string, JsonSchema> = {};
  for (const [status, statusCodes] of [...byStatus].sort(([a], [b]) => a - b)) {
    const headers: Record<string, unknown> = { "X-Request-Id": { $ref: "#/components/headers/X-Request-Id" } };
    if (statusCodes.includes("rate_limited") || statusCodes.includes("quota_exceeded")) {
      headers["Retry-After"] = { $ref: "#/components/headers/Retry-After" };
    }
    out[String(status)] = {
      description: statusCodes.map((code) => `\`${code}\`: ${ERROR_DESCRIPTIONS[code]}`).join("\n\n"),
      headers,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/Error" },
          examples: Object.fromEntries(
            statusCodes.map((code) => [code, { summary: code, value: errorExample(code) }]),
          ),
        },
      },
    };
  }
  return out;
}

function successResponse(
  description: string,
  schema: z.ZodType,
  collector: SchemaCollector,
  extraHeaders: Record<string, unknown> = {},
): JsonSchema {
  const example = schemaExample(schema);
  return {
    description,
    headers: { ...RATE_LIMIT_HEADERS, ...extraHeaders },
    content: {
      "application/json": {
        schema: collector.convert(schema, "output"),
        ...(example !== undefined ? { example } : {}),
      },
    },
  };
}

function operationFor(endpoint: EndpointDef, collector: SchemaCollector): JsonSchema {
  const isJob = endpoint.successStatus === 202;
  const parameters = [
    ...parametersFor(endpoint.input.params, "path", collector),
    ...parametersFor(endpoint.input.query, "query", collector),
    ...(endpoint.idempotent ? [{ $ref: "#/components/parameters/IdempotencyKey" }] : []),
    { $ref: "#/components/parameters/RequestId" },
  ];

  const responses: Record<string, JsonSchema> = {
    [String(endpoint.successStatus)]: successResponse(
      endpoint.successDescription,
      endpoint.output,
      collector,
      isJob ? { Location: { $ref: "#/components/headers/Location" } } : {},
    ),
    ...Object.fromEntries(
      (endpoint.extraResponses ?? []).map((r) => [String(r.status), successResponse(r.description, r.schema, collector)]),
    ),
    ...errorResponses([...COMMON_ERRORS, ...endpoint.errors]),
  };

  const notes = [
    endpoint.description,
    endpoint.scope ? `**Scope:** \`${endpoint.scope}\`.` : "**Scope:** any.",
    endpoint.costClass === "pipeline" ? "**Cost:** counts toward the daily pipeline quota when accepted." : null,
    endpoint.idempotent ? "Accepts `Idempotency-Key`." : null,
  ].filter(Boolean);

  let requestBody: JsonSchema | undefined;
  if (endpoint.input.body) {
    const example = schemaExample(endpoint.input.body);
    requestBody = {
      required: true,
      content: {
        "application/json": {
          schema: collector.convert(endpoint.input.body, "input"),
          ...(example !== undefined ? { example } : {}),
        },
      },
    };
  }

  return {
    operationId: endpoint.operationId,
    summary: endpoint.summary,
    description: notes.join("\n\n"),
    tags: endpoint.tags,
    "x-scope": endpoint.scope,
    "x-cost-class": endpoint.costClass,
    parameters,
    ...(requestBody ? { requestBody } : {}),
    responses,
  };
}

export function buildOpenApiDocument(baseUrl: string = appBaseUrl()): JsonSchema {
  const collector = new SchemaCollector();
  collector.convert(errorBodySchema, "output");

  const paths: Record<string, Record<string, JsonSchema>> = {};
  for (const endpoint of Object.values(endpoints) as EndpointDef[]) {
    const item = (paths[endpoint.path] ??= {});
    const method = endpoint.method.toLowerCase();
    if (item[method]) {
      throw new Error(`OpenAPI: duplicate ${endpoint.method} ${endpoint.path}`);
    }
    item[method] = operationFor(endpoint, collector);
  }

  return {
    openapi: "3.1.0",
    jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
    info: {
      title: "Dainik Samachar API",
      version: API_VERSION,
      summary: "News briefings, stock research, instrument search and newsletters. Requires Pro.",
      description: apiDocsMarkdown({ baseUrl, limits: getProApiLimits() }),
    },
    servers: [{ url: `${baseUrl}/api/v1`, description: "Production" }],
    security: [{ bearerAuth: [] }],
    tags: TAGS,
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "ds_live_<43 base62 chars>",
          description: "API key from Settings → Developers (Pro plan).",
        },
      },
      parameters: {
        IdempotencyKey: {
          name: "Idempotency-Key",
          in: "header",
          required: false,
          description: "Replays the first response for 24h instead of starting a second job.",
          schema: { type: "string", minLength: 1, maxLength: 255 },
          example: "5f2b7c1e-8a9d-4e3f-b2a1-0c9d8e7f6a5b",
        },
        RequestId: {
          name: "X-Request-Id",
          in: "header",
          required: false,
          description: "Your own id (8–128 of `A-Z a-z 0-9 . _ : -`), echoed back and in errors.",
          schema: { type: "string", minLength: 8, maxLength: 128 },
        },
      },
      headers: {
        "X-Request-Id": { description: "Id of this request (also in error bodies).", schema: { type: "string" } },
        "X-RateLimit-Limit": { description: "Requests allowed per minute for this key.", schema: { type: "integer" } },
        "X-RateLimit-Remaining": { description: "Requests left in the current window.", schema: { type: "integer" } },
        "X-RateLimit-Reset": { description: "Unix time (s) when the current window ends.", schema: { type: "integer" } },
        "Retry-After": { description: "Seconds to wait before retrying.", schema: { type: "integer" } },
        Location: { description: "URL of the job (`GET /jobs/{id}`).", schema: { type: "string" } },
      },
      schemas: collector.components,
    },
  };
}
