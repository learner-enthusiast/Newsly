/**
 * News search planner (not an LLM agent)
 *
 * What it does: Builds the Serp search query string and locale hints for a daily
 * news request from structured inputs — local vs world scope, date, location, and
 * news vs web search channel. Pure string rules; no model call.
 *
 * Input: type LOCAL or WORLD; date (YYYY-MM-DD); channel news or search; location
 * required when type is LOCAL.
 *
 * Output: { query, channel, suggestedGl, suggestedHl, input } ready for Serp APIs.
 */

import { z } from "zod";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

export const newsSearchPlannerChannelSchema = z.enum(["news", "search"]);

export type NewsSearchPlannerChannel = z.infer<
  typeof newsSearchPlannerChannelSchema
>;

/** Planner input: LOCAL requires location; channel picks google_news vs web news tab query shape. */
export const newsSearchPlannerInputSchema = z
  .object({
    type: z.enum(["LOCAL", "WORLD"]),
    location: z.string().min(1).optional(),
    date: isoDateSchema,
    channel: newsSearchPlannerChannelSchema,
  })
  .superRefine((data, ctx) => {
    if (data.type === "LOCAL" && !data.location?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "location is required when type is LOCAL",
        path: ["location"],
      });
    }
  });

export type NewsSearchPlannerInput = z.infer<typeof newsSearchPlannerInputSchema>;

export const newsSearchPlannerOutputSchema = z.object({
  query: z.string().min(3).max(500),
  channel: newsSearchPlannerChannelSchema,
  suggestedGl: z.string().min(2).max(5).optional(),
  suggestedHl: z.string().min(2).max(10),
});

export type NewsSearchPlannerOutput = z.infer<
  typeof newsSearchPlannerOutputSchema
>;

export type NewsSearchPlannerResult = NewsSearchPlannerOutput & {
  input: NewsSearchPlannerInput;
};

const LOCATION_TO_GL: Record<string, string> = {
  india: "in",
  "united states": "us",
  usa: "us",
  us: "us",
  "united kingdom": "uk",
  uk: "uk",
  canada: "ca",
  australia: "au",
  japan: "jp",
  germany: "de",
  france: "fr",
  singapore: "sg",
};

function addDaysIsoDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

function googleDateWindow(date: string): string {
  const before = addDaysIsoDate(date, 1);
  return `after:${date} before:${before}`;
}

function resolveSuggestedGl(
  type: NewsSearchPlannerInput["type"],
  location?: string,
): string | undefined {
  if (type === "WORLD") {
    return "us";
  }
  const key = location?.trim().toLowerCase();
  if (!key) {
    return undefined;
  }
  return LOCATION_TO_GL[key] ?? undefined;
}

function buildLocalQuery(
  location: string,
  date: string,
  channel: NewsSearchPlannerChannel,
): string {
  const loc = location.trim();
  if (channel === "search") {
    return `${loc} stock market economy business news ${googleDateWindow(date)}`;
  }
  return `${loc} stock market economy business news ${date}`;
}

function buildWorldQuery(
  date: string,
  channel: NewsSearchPlannerChannel,
): string {
  if (channel === "search") {
    return `global stock markets economy business news ${googleDateWindow(date)}`;
  }
  return `world stock markets economy central banks business news ${date}`;
}

/** Build the single Serp query for the given params (no LLM). */
export function buildNewsSearchQuery(
  input: NewsSearchPlannerInput,
): NewsSearchPlannerResult {
  const parsed = newsSearchPlannerInputSchema.parse(input);

  const query =
    parsed.type === "LOCAL"
      ? buildLocalQuery(parsed.location!, parsed.date, parsed.channel)
      : buildWorldQuery(parsed.date, parsed.channel);

  const output = newsSearchPlannerOutputSchema.parse({
    query,
    channel: parsed.channel,
    suggestedGl: resolveSuggestedGl(parsed.type, parsed.location),
    suggestedHl: "en",
  });

  return {
    ...output,
    input: parsed,
  };
}

/** @alias buildNewsSearchQuery */
export function runNewsSearchPlanner(
  input: NewsSearchPlannerInput,
): NewsSearchPlannerResult {
  return buildNewsSearchQuery(input);
}
