import { newsScopeSchema } from "@/lib/newsScope";
import { computeNextRun } from "@/lib/newsletter/schedule";
import {
  MAX_NEWSLETTERS_PER_USER,
  NEWSLETTER_MAX_STORY_COUNT,
} from "@/lib/newsletter/constants";
import { z } from "zod";

const timeSchema = z.string().regex(/^\d{2}:\d{2}$/);

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const newsletterContentSchema = z
  .object({
    name: z.string().min(1).max(120),
    email: z.string().email().max(200),
    location: z.string().min(1).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    scope: newsScopeSchema,
    storyCount: z.number().int().min(1).max(NEWSLETTER_MAX_STORY_COUNT),
    categories: z.array(z.string().min(1).max(80)).max(10).optional(),
    customQuery: z.string().min(1).max(500).optional(),
    language: z.string().min(1).max(40).optional(),
    sources: z.array(z.string().min(1).max(200)).max(10).optional(),
  })
  .superRefine((data, ctx) => {
    const needsLocation = data.scope === "local" || data.scope === "both";
    if (needsLocation && !data.location?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "location is required when scope is local or both",
        path: ["location"],
      });
    }
  });

const scheduleSchema = z
  .object({
    frequency: z.enum(["DAILY", "WEEKDAYS", "WEEKLY", "MONTHLY"]),
    sendTimeLocal: timeSchema,
    timezone: z.string().min(1).max(80),
    dayOfWeek: z.number().int().min(1).max(7).nullable().optional(),
    dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (!isValidTimezone(data.timezone)) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid timezone",
        path: ["timezone"],
      });
    }
    if (data.frequency === "WEEKLY" && data.dayOfWeek == null) {
      ctx.addIssue({
        code: "custom",
        message: "dayOfWeek is required for WEEKLY",
        path: ["dayOfWeek"],
      });
    }
    if (data.frequency === "MONTHLY" && data.dayOfMonth == null) {
      ctx.addIssue({
        code: "custom",
        message: "dayOfMonth is required for MONTHLY",
        path: ["dayOfMonth"],
      });
    }
  });

export const createNewsletterSchema =
  newsletterContentSchema.and(scheduleSchema);
export const updateNewsletterSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    email: z.string().email().max(200).optional(),
    location: z.string().min(1).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    scope: newsScopeSchema.optional(),
    storyCount: z.number().int().min(1).max(NEWSLETTER_MAX_STORY_COUNT).optional(),
    categories: z.array(z.string().min(1).max(80)).max(10).optional(),
    customQuery: z.string().min(1).max(500).optional(),
    language: z.string().min(1).max(40).optional(),
    sources: z.array(z.string().min(1).max(200)).max(10).optional(),
    frequency: z.enum(["DAILY", "WEEKDAYS", "WEEKLY", "MONTHLY"]).optional(),
    sendTimeLocal: timeSchema.optional(),
    timezone: z.string().min(1).max(80).optional(),
    dayOfWeek: z.number().int().min(1).max(7).nullable().optional(),
    dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.timezone && !isValidTimezone(data.timezone)) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid timezone",
        path: ["timezone"],
      });
    }
  });

export function computeNextRunFromSchedule(
  schedule: z.infer<typeof scheduleSchema>,
  from?: Date,
): Date {
  return computeNextRun({
    frequency: schedule.frequency,
    sendTimeLocal: schedule.sendTimeLocal,
    timezone: schedule.timezone,
    dayOfWeek: schedule.dayOfWeek ?? null,
    dayOfMonth: schedule.dayOfMonth ?? null,
    from,
  });
}

export { MAX_NEWSLETTERS_PER_USER };
