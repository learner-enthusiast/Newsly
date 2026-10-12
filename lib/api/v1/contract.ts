/**
 * Every public API v1 operation: method, path, scope, cost class, input and
 * output schemas, documented errors. Route files bind a handler to one of
 * these with `apiRoute`; the OpenAPI document is generated from this list.
 *
 * Build-safe: schemas and metadata only, no server imports.
 */

import type { z } from "zod";
import type { ApiErrorCode } from "@/lib/api/v1/errors";
import type { ApiScope } from "@/lib/api/v1/scopes";
import {
  briefingListSchema,
  briefingParamsSchema,
  briefingSchema,
  createNewsletterBodySchema,
  deletedSchema,
  instrumentSearchResultSchema,
  listBriefingsQuerySchema,
  listResearchQuerySchema,
  listStoriesQuerySchema,
  meSchema,
  newsletterListSchema,
  newsletterParamsSchema,
  newsletterSchema,
  researchParamsSchema,
  researchReportListSchema,
  researchReportSchema,
  searchInstrumentsQuerySchema,
  storyListSchema,
  storyParamsSchema,
  storySchema,
  updateNewsletterBodySchema,
} from "@/lib/api/v1/schemas";

/** `read` and `search` count only toward the per-minute limit; `pipeline` also toward the daily quota. */
export type CostClass = "read" | "search" | "pipeline";

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type EndpointInput = {
  query?: z.ZodType;
  params?: z.ZodType;
  body?: z.ZodType;
};

export type EndpointResponse = {
  status: number;
  description: string;
  schema: z.ZodType;
};

export type EndpointDef<
  I extends EndpointInput = EndpointInput,
  O extends z.ZodType = z.ZodType,
> = {
  method: HttpMethod;
  /** OpenAPI path under `/api/v1`, e.g. `/stories/{id}`. */
  path: string;
  operationId: string;
  summary: string;
  description?: string;
  tags: string[];
  /** Required key scope; null = any valid key. */
  scope: ApiScope | null;
  costClass: CostClass;
  input: I;
  output: O;
  successStatus: number;
  successDescription: string;
  /** Other success responses with their own schema (e.g. 200 dedupe next to 202). */
  extraResponses?: EndpointResponse[];
  /** Accepts `Idempotency-Key`. */
  idempotent?: boolean;
  /** Endpoint-specific errors, on top of the ones every endpoint can return. */
  errors: ApiErrorCode[];
};

function defineEndpoint<I extends EndpointInput, O extends z.ZodType>(
  def: EndpointDef<I, O>,
): EndpointDef<I, O> {
  return def;
}

/** Errors any authenticated endpoint can return. */
export const COMMON_ERRORS: ApiErrorCode[] = [
  "unauthorized",
  "plan_required",
  "forbidden",
  "rate_limited",
  "internal_error",
];

export const endpoints = {
  me: defineEndpoint({
    method: "GET",
    path: "/me",
    operationId: "me.get",
    summary: "Current key, plan, limits and quota",
    tags: ["Account"],
    scope: null,
    costClass: "read",
    input: {},
    output: meSchema,
    successStatus: 200,
    successDescription: "The key's account, plan, limits and today's pipeline usage.",
    errors: [],
  }),

  listStories: defineEndpoint({
    method: "GET",
    path: "/stories",
    operationId: "stories.list",
    summary: "List public stories",
    description:
      "Public stories (from successful briefings and published community stories), newest first by `publishedAt`, then `id`. Stories without a publish time come last.",
    tags: ["Stories"],
    scope: "news:read",
    costClass: "read",
    input: { query: listStoriesQuerySchema },
    output: storyListSchema,
    successStatus: 200,
    successDescription: "One page of stories.",
    errors: ["invalid_request"],
  }),

  getStory: defineEndpoint({
    method: "GET",
    path: "/stories/{id}",
    operationId: "stories.get",
    summary: "Get a public story",
    tags: ["Stories"],
    scope: "news:read",
    costClass: "read",
    input: { params: storyParamsSchema },
    output: storySchema,
    successStatus: 200,
    successDescription: "The story with its full content.",
    errors: ["invalid_request", "not_found"],
  }),

  searchInstruments: defineEndpoint({
    method: "GET",
    path: "/instruments/search",
    operationId: "instruments.search",
    summary: "Search stocks, ETFs and mutual funds",
    description: "Indian listed instruments (NSE/BSE equity segments). Use `instrumentKey` to start research.",
    tags: ["Instruments"],
    scope: "instruments:read",
    costClass: "search",
    input: { query: searchInstrumentsQuerySchema },
    output: instrumentSearchResultSchema,
    successStatus: 200,
    successDescription: "Matches, best first.",
    errors: ["invalid_request"],
  }),

  listBriefings: defineEndpoint({
    method: "GET",
    path: "/news/briefings",
    operationId: "briefings.list",
    summary: "List your briefings",
    description: "Briefings you requested (web or API), newest first.",
    tags: ["Briefings"],
    scope: "news:read",
    costClass: "read",
    input: { query: listBriefingsQuerySchema },
    output: briefingListSchema,
    successStatus: 200,
    successDescription: "One page of briefings.",
    errors: ["invalid_request"],
  }),

  getBriefing: defineEndpoint({
    method: "GET",
    path: "/news/briefings/{id}",
    operationId: "briefings.get",
    summary: "Get a briefing and its stories",
    tags: ["Briefings"],
    scope: "news:read",
    costClass: "read",
    input: { params: briefingParamsSchema },
    output: briefingSchema,
    successStatus: 200,
    successDescription: "The briefing; `stories` is filled once it has succeeded.",
    errors: ["invalid_request", "not_found"],
  }),

  listResearch: defineEndpoint({
    method: "GET",
    path: "/research/reports",
    operationId: "research.listReports",
    summary: "List your research reports",
    tags: ["Research"],
    scope: "research:read",
    costClass: "read",
    input: { query: listResearchQuerySchema },
    output: researchReportListSchema,
    successStatus: 200,
    successDescription: "One page of reports, newest first.",
    errors: ["invalid_request"],
  }),

  getResearch: defineEndpoint({
    method: "GET",
    path: "/research/reports/{id}",
    operationId: "research.getReport",
    summary: "Get a research report",
    tags: ["Research"],
    scope: "research:read",
    costClass: "read",
    input: { params: researchParamsSchema },
    output: researchReportSchema,
    successStatus: 200,
    successDescription: "The report; `reportMarkdown` is set once it has succeeded.",
    errors: ["invalid_request", "not_found"],
  }),

  listNewsletters: defineEndpoint({
    method: "GET",
    path: "/newsletters",
    operationId: "newsletters.list",
    summary: "List your newsletters",
    tags: ["Newsletters"],
    scope: "newsletters:read",
    costClass: "read",
    input: {},
    output: newsletterListSchema,
    successStatus: 200,
    successDescription: "All your newsletters, newest first.",
    errors: [],
  }),

  createNewsletter: defineEndpoint({
    method: "POST",
    path: "/newsletters",
    operationId: "newsletters.create",
    summary: "Create a newsletter",
    description:
      "Sent to the account's primary email. Counts toward the per-account newsletter limit (shared with the web app).",
    tags: ["Newsletters"],
    scope: "newsletters:write",
    costClass: "read",
    input: { body: createNewsletterBodySchema },
    output: newsletterSchema,
    successStatus: 201,
    successDescription: "The new newsletter (active).",
    errors: ["invalid_request", "limit_reached", "payload_too_large", "unsupported_media_type"],
  }),

  getNewsletter: defineEndpoint({
    method: "GET",
    path: "/newsletters/{id}",
    operationId: "newsletters.get",
    summary: "Get a newsletter",
    tags: ["Newsletters"],
    scope: "newsletters:read",
    costClass: "read",
    input: { params: newsletterParamsSchema },
    output: newsletterSchema,
    successStatus: 200,
    successDescription: "The newsletter and its recent deliveries.",
    errors: ["invalid_request", "not_found"],
  }),

  updateNewsletter: defineEndpoint({
    method: "PATCH",
    path: "/newsletters/{id}",
    operationId: "newsletters.update",
    summary: "Update a newsletter",
    tags: ["Newsletters"],
    scope: "newsletters:write",
    costClass: "read",
    input: { params: newsletterParamsSchema, body: updateNewsletterBodySchema },
    output: newsletterSchema,
    successStatus: 200,
    successDescription: "The updated newsletter.",
    errors: ["invalid_request", "not_found", "payload_too_large", "unsupported_media_type"],
  }),

  deleteNewsletter: defineEndpoint({
    method: "DELETE",
    path: "/newsletters/{id}",
    operationId: "newsletters.delete",
    summary: "Delete a newsletter",
    tags: ["Newsletters"],
    scope: "newsletters:write",
    costClass: "read",
    input: { params: newsletterParamsSchema },
    output: deletedSchema,
    successStatus: 200,
    successDescription: "Deleted.",
    errors: ["invalid_request", "not_found"],
  }),

  pauseNewsletter: defineEndpoint({
    method: "POST",
    path: "/newsletters/{id}/pause",
    operationId: "newsletters.pause",
    summary: "Pause a newsletter",
    tags: ["Newsletters"],
    scope: "newsletters:write",
    costClass: "read",
    input: { params: newsletterParamsSchema },
    output: newsletterSchema,
    successStatus: 200,
    successDescription: "The paused newsletter (`nextRunAt` is null). Pausing twice is fine.",
    errors: ["invalid_request", "not_found"],
  }),

  resumeNewsletter: defineEndpoint({
    method: "POST",
    path: "/newsletters/{id}/resume",
    operationId: "newsletters.resume",
    summary: "Resume a newsletter",
    tags: ["Newsletters"],
    scope: "newsletters:write",
    costClass: "read",
    input: { params: newsletterParamsSchema },
    output: newsletterSchema,
    successStatus: 200,
    successDescription: "The active newsletter with its next run.",
    errors: ["invalid_request", "not_found"],
  }),
} as const;

export type EndpointName = keyof typeof endpoints;
