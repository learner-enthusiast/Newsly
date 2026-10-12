/**
 * Zod schemas of the public API v1: request inputs and response DTOs.
 *
 * Client- and build-safe (no server imports): the OpenAPI document is
 * generated from these with `z.toJSONSchema`, and `.meta({ id })` turns a
 * schema into a named `components.schemas` entry.
 *
 * Inputs are strict (unknown fields → 400). Outputs are plain objects, so the
 * handler's `output.parse` strips anything a mapper adds by mistake.
 */

import { z } from "zod";
import { API_ERROR_CODES } from "@/lib/api/v1/errors";
import { API_SCOPES } from "@/lib/api/v1/scopes";

// ── Primitives ──

const dateTime = (description?: string) =>
  z.string().meta({ format: "date-time", ...(description ? { description } : {}) });

const nullableDateTime = (description?: string) => dateTime(description).nullable();

const EXAMPLE_TIME = "2026-10-12T06:30:00.000Z";

export const limitParam = (fallback = 20, max = 50) =>
  z.coerce
    .number()
    .int()
    .min(1)
    .max(max)
    .default(fallback)
    .meta({ description: `Page size, 1–${max} (default ${fallback}).` });

export const cursorParam = z
  .string()
  .min(1)
  .max(512)
  .optional()
  .meta({ description: "Opaque `nextCursor` from the previous page." });

const uuidParam = (what: string) => z.uuid().meta({ description: `${what} id (UUID).` });
const cuidParam = (what: string) =>
  z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/)
    .meta({ description: `${what} id.` });

/** `YYYY-MM-DD` (whole UTC day) or an ISO date-time. */
const dateOrDateTime = z
  .union([z.iso.date(), z.iso.datetime({ offset: true })])
  .meta({ description: "`YYYY-MM-DD` (UTC day) or ISO 8601 date-time." });

// ── Errors ──

export const errorBodySchema = z
  .object({
    error: z.object({
      code: z.enum(API_ERROR_CODES),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string(),
    }),
  })
  .meta({
    id: "Error",
    description: "Every non-2xx response has this shape.",
    examples: [
      {
        error: {
          code: "invalid_request",
          message: "Request validation failed.",
          details: { fields: [{ path: "storyCount", message: "Too big: expected number to be <=12" }] },
          requestId: "req_8f2c1d9e4b7a4c3e",
        },
      },
    ],
  });

export type ErrorBody = z.infer<typeof errorBodySchema>;

// ── Me ──

export const meSchema = z
  .object({
    user: z.object({ id: z.string(), email: z.string() }),
    plan: z.enum(["pro"]),
    apiKey: z.object({
      id: z.string(),
      name: z.string(),
      prefix: z.string(),
      scopes: z.array(z.enum(API_SCOPES)),
      createdAt: dateTime(),
      expiresAt: nullableDateTime(),
    }),
    limits: z.object({
      requestsPerMinute: z.number().int(),
      pipelineJobsPerDay: z.number().int(),
    }),
    usage: z.object({
      pipelineJobsToday: z.number().int(),
      pipelineJobsRemaining: z.number().int(),
      quotaResetsAt: dateTime("Next UTC midnight."),
    }),
  })
  .meta({
    id: "Me",
    examples: [
      {
        user: { id: "cmg1x2y3z0000abcd", email: "you@example.com" },
        plan: "pro",
        apiKey: {
          id: "6c1e2f8a-3b4d-4e5f-9a0b-1c2d3e4f5a6b",
          name: "Trading bot",
          prefix: "ds_live_AbCd",
          scopes: ["news:read", "research:read"],
          createdAt: EXAMPLE_TIME,
          expiresAt: null,
        },
        limits: { requestsPerMinute: 60, pipelineJobsPerDay: 50 },
        usage: {
          pipelineJobsToday: 3,
          pipelineJobsRemaining: 47,
          quotaResetsAt: "2026-10-13T00:00:00.000Z",
        },
      },
    ],
  });

// ── Stories ──

export const STORY_REGIONS = ["local", "world"] as const;

export const storySourceSchema = z
  .object({ url: z.string(), title: z.string(), domain: z.string() })
  .meta({ id: "StorySource" });

const storyFields = {
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  summary: z.string(),
  category: z.string(),
  location: z.string().nullable(),
  region: z
    .enum(["local", "world", "both"])
    .nullable()
    .meta({ description: "Scope of the briefing that produced the story; null for community stories." }),
  publishedAt: nullableDateTime(),
  imageUrl: z.string().nullable(),
  upvotes: z.number().int(),
  downvotes: z.number().int(),
  sources: z.array(storySourceSchema),
  url: z.string().meta({ description: "Web page of the story." }),
};

const exampleStory = {
  id: "0d9a7b3c-5e1f-4a2b-8c7d-6e5f4a3b2c1d",
  title: "RBI holds repo rate at 5.5%",
  description: "The MPC kept rates unchanged for a third meeting.",
  summary: "The Reserve Bank of India held its policy rate…",
  category: "economy",
  location: "India",
  region: "world" as const,
  publishedAt: EXAMPLE_TIME,
  imageUrl: null,
  upvotes: 12,
  downvotes: 1,
  sources: [{ url: "https://example.com/rbi", title: "RBI policy", domain: "example.com" }],
  url: "https://example.com/newsStory/0d9a7b3c-5e1f-4a2b-8c7d-6e5f4a3b2c1d",
};

export const storySummarySchema = z
  .object(storyFields)
  .meta({ id: "StorySummary", examples: [exampleStory] });

export const storySchema = z
  .object({ ...storyFields, content: z.string().meta({ description: "Full Markdown body." }) })
  .meta({ id: "Story", examples: [{ ...exampleStory, content: "## What happened\n…" }] });

export const storyListSchema = z
  .object({ data: z.array(storySummarySchema), nextCursor: z.string().nullable() })
  .meta({ id: "StoryList", examples: [{ data: [exampleStory], nextCursor: null }] });

export const listStoriesQuerySchema = z.strictObject({
  region: z
    .enum(STORY_REGIONS)
    .optional()
    .meta({
      description:
        "`local` = stories from local or local+world briefings; `world` = world or local+world briefings. Community stories have no region and are excluded when set.",
    }),
  location: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .optional()
    .meta({ description: "Case-insensitive match inside the story location, e.g. `India`, `Hyderabad`." }),
  category: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .optional()
    .meta({ description: "Exact category, case-insensitive, e.g. `markets`, `economy`." }),
  from: dateOrDateTime.optional().meta({ description: "Published at or after (inclusive)." }),
  to: dateOrDateTime
    .optional()
    .meta({ description: "Published at or before (inclusive; a date covers the whole UTC day)." }),
  q: z
    .string()
    .trim()
    .min(2)
    .max(200)
    .optional()
    .meta({ description: "Text search in title, description and summary." }),
  limit: limitParam(),
  cursor: cursorParam,
});

export const storyParamsSchema = z.strictObject({ id: uuidParam("Story") });

// ── Instruments ──

export const INSTRUMENT_TYPES = ["stock", "etf", "mutual_fund"] as const;

export const instrumentSchema = z
  .object({
    instrumentKey: z.string().meta({ description: "Pass this to `research.createReport`." }),
    name: z.string(),
    shortName: z.string().nullable(),
    tradingSymbol: z.string(),
    exchange: z.string(),
    segment: z.string(),
    instrumentType: z.string(),
    isin: z.string().nullable(),
  })
  .meta({ id: "Instrument" });

const exampleInstrument = {
  instrumentKey: "NSE_EQ|INE002A01018",
  name: "RELIANCE INDUSTRIES LTD",
  shortName: "Reliance",
  tradingSymbol: "RELIANCE",
  exchange: "NSE",
  segment: "NSE_EQ",
  instrumentType: "EQ",
  isin: "INE002A01018",
};

export const instrumentSearchResultSchema = z
  .object({ data: z.array(instrumentSchema) })
  .meta({ id: "InstrumentSearchResult", examples: [{ data: [exampleInstrument] }] });

export const searchInstrumentsQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(100).meta({ description: "Name, short name or symbol." }),
  type: z.enum(INSTRUMENT_TYPES).default("stock"),
  exchange: z
    .enum(["NSE", "BSE"])
    .optional()
    .meta({ description: "Equity segment; both when omitted." }),
  limit: limitParam(10, 25),
});

// ── Briefings ──

export const BRIEFING_STATUSES = ["pending", "succeeded", "failed"] as const;

const briefingFields = {
  id: z.string(),
  status: z.enum(BRIEFING_STATUSES),
  date: z.string().meta({ description: "Briefing date, `YYYY-MM-DD`." }),
  scope: z.enum(["local", "world", "both"]),
  location: z.string().nullable(),
  storyCount: z.number().int().meta({ description: "Requested stories." }),
  storiesCreated: z.number().int(),
  categories: z.array(z.string()),
  customQuery: z.string().nullable(),
  language: z.string(),
  sources: z.array(z.string()),
  error: z.object({ message: z.string() }).nullable(),
  createdAt: dateTime(),
  completedAt: nullableDateTime(),
};

const exampleBriefing = {
  id: "3f6c2a1b-9d8e-4f7a-b6c5-d4e3f2a1b0c9",
  status: "succeeded" as const,
  date: "2026-10-12",
  scope: "local" as const,
  location: "Hyderabad, Telangana, India",
  storyCount: 5,
  storiesCreated: 5,
  categories: ["markets"],
  customQuery: null,
  language: "English",
  sources: [],
  error: null,
  createdAt: EXAMPLE_TIME,
  completedAt: "2026-10-12T06:34:10.000Z",
};

export const briefingSummarySchema = z
  .object(briefingFields)
  .meta({ id: "BriefingSummary", examples: [exampleBriefing] });

export const briefingSchema = z
  .object({ ...briefingFields, stories: z.array(storySchema) })
  .meta({
    id: "Briefing",
    description: "Stories are listed once the briefing has succeeded.",
    examples: [{ ...exampleBriefing, stories: [] }],
  });

export const briefingListSchema = z
  .object({ data: z.array(briefingSummarySchema), nextCursor: z.string().nullable() })
  .meta({ id: "BriefingList", examples: [{ data: [exampleBriefing], nextCursor: null }] });

export const listBriefingsQuerySchema = z.strictObject({
  status: z.enum(BRIEFING_STATUSES).optional(),
  limit: limitParam(),
  cursor: cursorParam,
});

export const briefingParamsSchema = z.strictObject({ id: uuidParam("Briefing") });

// ── Research ──

export const RESEARCH_ASSET_TYPES = ["STOCK", "ETF", "MUTUAL_FUND"] as const;
export const RESEARCH_STATUSES = ["pending", "running", "succeeded", "failed"] as const;

const researchFields = {
  id: z.string(),
  assetType: z.enum(RESEARCH_ASSET_TYPES),
  status: z.enum(RESEARCH_STATUSES),
  instrument: z.object({
    instrumentKey: z.string().nullable(),
    name: z.string().nullable(),
    symbol: z.string().nullable(),
    exchange: z.string().nullable(),
  }),
  prompt: z.string().nullable(),
  error: z.object({ message: z.string() }).nullable(),
  createdAt: dateTime(),
  startedAt: nullableDateTime(),
  completedAt: nullableDateTime(),
};

const exampleResearch = {
  id: "cmg9a8b7c0001xyz",
  assetType: "STOCK" as const,
  status: "succeeded" as const,
  instrument: {
    instrumentKey: "NSE_EQ|INE002A01018",
    name: "RELIANCE INDUSTRIES LTD",
    symbol: "RELIANCE",
    exchange: "NSE",
  },
  prompt: "How are valuation and recent results?",
  error: null,
  createdAt: EXAMPLE_TIME,
  startedAt: "2026-10-12T06:30:02.000Z",
  completedAt: "2026-10-12T06:33:40.000Z",
};

export const researchReportSummarySchema = z
  .object(researchFields)
  .meta({ id: "ResearchReportSummary", examples: [exampleResearch] });

export const researchSourceSchema = z
  .object({
    title: z.string().nullable(),
    url: z.string().nullable(),
    provider: z.string(),
    type: z.string(),
  })
  .meta({ id: "ResearchSource" });

export const researchReportSchema = z
  .object({
    ...researchFields,
    reportMarkdown: z.string().nullable().meta({ description: "Set once the report has succeeded." }),
    sources: z.array(researchSourceSchema),
  })
  .meta({
    id: "ResearchReport",
    examples: [{ ...exampleResearch, reportMarkdown: "# Reliance Industries\n…", sources: [] }],
  });

export const researchReportListSchema = z
  .object({ data: z.array(researchReportSummarySchema), nextCursor: z.string().nullable() })
  .meta({ id: "ResearchReportList", examples: [{ data: [exampleResearch], nextCursor: null }] });

export const listResearchQuerySchema = z.strictObject({
  assetType: z.enum(RESEARCH_ASSET_TYPES).optional(),
  status: z.enum(RESEARCH_STATUSES).optional(),
  limit: limitParam(),
  cursor: cursorParam,
});

export const researchParamsSchema = z.strictObject({ id: cuidParam("Research report") });

// ── Newsletters ──

const FREQUENCIES = ["DAILY", "WEEKDAYS", "WEEKLY", "MONTHLY"] as const;
export const NEWSLETTER_MAX_STORIES = 20;

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const timezoneSchema = z
  .string()
  .min(1)
  .max(80)
  .refine(isValidTimezone, "Invalid IANA timezone")
  .meta({ description: "IANA timezone, e.g. `Asia/Kolkata`." });

const newsletterInputFields = {
  name: z.string().trim().min(1).max(120),
  scope: z.enum(["local", "world", "both"]),
  location: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .meta({ description: "Required for `local` and `both`." }),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  storyCount: z.number().int().min(1).max(NEWSLETTER_MAX_STORIES),
  categories: z.array(z.string().min(1).max(80)).max(10),
  customQuery: z.string().trim().min(1).max(500),
  language: z.string().trim().min(1).max(40),
  sources: z.array(z.string().min(1).max(200)).max(10),
  frequency: z.enum(FREQUENCIES),
  sendTimeLocal: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24h)")
    .meta({ description: "Local send time, `HH:MM`." }),
  timezone: timezoneSchema,
  dayOfWeek: z.number().int().min(1).max(7).meta({ description: "1 = Monday … 7 = Sunday. WEEKLY only." }),
  dayOfMonth: z.number().int().min(1).max(31).meta({ description: "MONTHLY only." }),
};

export const createNewsletterBodySchema = z
  .strictObject({
    name: newsletterInputFields.name,
    scope: newsletterInputFields.scope,
    location: newsletterInputFields.location.optional(),
    latitude: newsletterInputFields.latitude.optional(),
    longitude: newsletterInputFields.longitude.optional(),
    storyCount: newsletterInputFields.storyCount,
    categories: newsletterInputFields.categories.optional(),
    customQuery: newsletterInputFields.customQuery.optional(),
    language: newsletterInputFields.language.optional(),
    sources: newsletterInputFields.sources.optional(),
    frequency: newsletterInputFields.frequency,
    sendTimeLocal: newsletterInputFields.sendTimeLocal,
    timezone: newsletterInputFields.timezone,
    dayOfWeek: newsletterInputFields.dayOfWeek.optional(),
    dayOfMonth: newsletterInputFields.dayOfMonth.optional(),
  })
  .superRefine((data, ctx) => {
    if ((data.scope === "local" || data.scope === "both") && !data.location) {
      ctx.addIssue({ code: "custom", message: "location is required when scope is local or both", path: ["location"] });
    }
    if ((data.latitude === undefined) !== (data.longitude === undefined)) {
      ctx.addIssue({ code: "custom", message: "latitude and longitude must be provided together", path: ["latitude"] });
    }
    if (data.frequency === "WEEKLY" && data.dayOfWeek === undefined) {
      ctx.addIssue({ code: "custom", message: "dayOfWeek is required for WEEKLY", path: ["dayOfWeek"] });
    }
    if (data.frequency === "MONTHLY" && data.dayOfMonth === undefined) {
      ctx.addIssue({ code: "custom", message: "dayOfMonth is required for MONTHLY", path: ["dayOfMonth"] });
    }
  })
  .meta({
    id: "NewsletterCreate",
    description: "Newsletters are always sent to the account's primary email.",
    examples: [
      {
        name: "Morning markets",
        scope: "world",
        storyCount: 5,
        categories: ["markets"],
        frequency: "WEEKDAYS",
        sendTimeLocal: "07:30",
        timezone: "Asia/Kolkata",
      },
    ],
  });

export const updateNewsletterBodySchema = z
  .strictObject({
    name: newsletterInputFields.name.optional(),
    scope: newsletterInputFields.scope.optional(),
    location: newsletterInputFields.location.nullable().optional(),
    latitude: newsletterInputFields.latitude.nullable().optional(),
    longitude: newsletterInputFields.longitude.nullable().optional(),
    storyCount: newsletterInputFields.storyCount.optional(),
    categories: newsletterInputFields.categories.optional(),
    customQuery: newsletterInputFields.customQuery.nullable().optional(),
    language: newsletterInputFields.language.nullable().optional(),
    sources: newsletterInputFields.sources.optional(),
    frequency: newsletterInputFields.frequency.optional(),
    sendTimeLocal: newsletterInputFields.sendTimeLocal.optional(),
    timezone: newsletterInputFields.timezone.optional(),
    dayOfWeek: newsletterInputFields.dayOfWeek.nullable().optional(),
    dayOfMonth: newsletterInputFields.dayOfMonth.nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if ((data.latitude == null) !== (data.longitude == null)) {
      ctx.addIssue({
        code: "custom",
        message: "latitude and longitude must be set (or cleared) together",
        path: ["latitude"],
      });
    }
  })
  .meta({
    id: "NewsletterUpdate",
    description: "Omitted fields keep their value; `null` clears an optional field.",
    examples: [{ storyCount: 8, sendTimeLocal: "08:00" }],
  });

export const newsletterDeliverySchema = z
  .object({
    id: z.string(),
    status: z.string(),
    scheduledFor: dateTime(),
    sentAt: nullableDateTime(),
    storyCount: z.number().int().nullable(),
  })
  .meta({ id: "NewsletterDelivery" });

const exampleNewsletter = {
  id: "cmg7n6e5w0002abc",
  name: "Morning markets",
  email: "you@example.com",
  isActive: true,
  scope: "world" as const,
  location: null,
  latitude: null,
  longitude: null,
  storyCount: 5,
  categories: ["markets"],
  customQuery: null,
  language: null,
  sources: [],
  frequency: "WEEKDAYS" as const,
  sendTimeLocal: "07:30",
  timezone: "Asia/Kolkata",
  dayOfWeek: null,
  dayOfMonth: null,
  nextRunAt: "2026-10-13T02:00:00.000Z",
  recentDeliveries: [],
};

export const newsletterSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string().meta({ description: "The account's primary email." }),
    isActive: z.boolean(),
    scope: z.enum(["local", "world", "both"]),
    location: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    storyCount: z.number().int(),
    categories: z.array(z.string()),
    customQuery: z.string().nullable(),
    language: z.string().nullable(),
    sources: z.array(z.string()),
    frequency: z.enum(FREQUENCIES),
    sendTimeLocal: z.string(),
    timezone: z.string(),
    dayOfWeek: z.number().int().nullable(),
    dayOfMonth: z.number().int().nullable(),
    nextRunAt: nullableDateTime("Null while paused."),
    recentDeliveries: z.array(newsletterDeliverySchema),
  })
  .meta({ id: "Newsletter", examples: [exampleNewsletter] });

export const newsletterListSchema = z
  .object({ data: z.array(newsletterSchema) })
  .meta({ id: "NewsletterList", examples: [{ data: [exampleNewsletter] }] });

export const newsletterParamsSchema = z.strictObject({ id: cuidParam("Newsletter") });

export const deletedSchema = z
  .object({ id: z.string(), deleted: z.literal(true) })
  .meta({ id: "Deleted", examples: [{ id: "cmg7n6e5w0002abc", deleted: true }] });
