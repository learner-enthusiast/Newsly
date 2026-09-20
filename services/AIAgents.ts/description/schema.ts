import { z } from "zod";
import { isoDateSchema } from "@/services/AIAgents.ts/planner-intake/schema";

/**
 * Strict structured-output shapes for the plan description agent.
 * Explicit objects/arrays only — no z.record/z.unknown, which OpenAI strict
 * mode rejects.
 */
export const descriptionImportantDaySchema = z.object({
  name: z.string(),
  date: isoDateSchema.nullable(),
  notes: z.string().nullable(),
});

export const descriptionTimingSchema = z.object({
  label: z.string(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
});

export const descriptionStopSchema = z.object({
  name: z.string(),
  type: z.string(),
  role: z.enum(["festival", "food"]),
  area: z.string().nullable(),
  arrives: z.string().nullable(),
});

export const descriptionDaySchema = z.object({
  dayNumber: z.number().int().positive(),
  date: isoDateSchema.nullable(),
  area: z.string().nullable(),
  window: z.string().nullable(),
  transport: z.string().nullable(),
  stops: z.array(descriptionStopSchema),
});

export const descriptionPreferencesSchema = z.object({
  transport: z.string().nullable(),
  budget: z.string().nullable(),
  crowdPreference: z.string().nullable(),
  walkingTolerance: z.string().nullable(),
  foodPreferences: z.array(z.string()),
  preferredAreas: z.array(z.string()),
});

export const descriptionSourceSchema = z.object({
  url: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  content: z.string(),
});

export const planDescriptionInputSchema = z.object({
  festival: z.string().min(1),
  city: z.string().min(1),
  year: z.number().int().min(1900).max(2200),
  festivalStart: isoDateSchema.nullable(),
  festivalEnd: isoDateSchema.nullable(),
  visitDates: z.array(isoDateSchema),
  legacy: z.string().nullable(),
  importantDays: z.array(descriptionImportantDaySchema),
  timings: z.array(descriptionTimingSchema),
  days: z.array(descriptionDaySchema),
  preferences: descriptionPreferencesSchema,
  sources: z.array(descriptionSourceSchema),
});

export const festivalTermSchema = z.object({
  term: z.string().min(1),
  meaning: z.string().min(1),
});

export const planDescriptionResultSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  /** Terminology actually supported by the sources, used for auditing. */
  festivalTerms: z.array(festivalTermSchema),
});

export type PlanDescriptionInput = z.input<typeof planDescriptionInputSchema>;
export type PlanDescriptionResult = z.output<typeof planDescriptionResultSchema>;
