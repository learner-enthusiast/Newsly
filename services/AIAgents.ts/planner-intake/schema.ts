import { z } from "zod";
import { strictOtherPreferencesSchema } from "@/services/planner/strictOpenAiSchema";

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: "Date must be YYYY-MM-DD",
});

export const festivalDatesSchema = z.object({
  start: isoDateSchema,
  end: isoDateSchema,
  sourceVerified: z.boolean(),
});

export const planningRequestSchema = z.object({
  festival: z.string().nullable(),
  canonicalFestival: z.string().nullable(),
  city: z.string().nullable(),
  year: z.number().int().min(1900).max(2200).nullable(),
  festivalDates: festivalDatesSchema.nullable(),
  visitDates: z.array(isoDateSchema).nullable(),
  durationDays: z.number().int().positive().nullable(),
  durationHours: z.number().int().positive().nullable(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  preferredAreas: z.array(z.string()),
  transport: z.string().nullable(),
  budget: z.string().nullable(),
  foodPreferences: z.array(z.string()),
  crowdPreference: z.string().nullable(),
  walkingTolerance: z.string().nullable(),
  otherPreferences: z.record(z.string(), z.unknown()),
});

export const plannerIntakeInputPromptSchema = z.object({
  type: z.string().min(1),
  field: z.string().min(1),
  options: z.array(z.unknown()).optional(),
});

export const plannerIntakeNeedsInputSchema = z.object({
  status: z.literal("needs_input"),
  message: z.string().min(1),
  request: planningRequestSchema,
  missing: z.array(z.string()),
  input: plannerIntakeInputPromptSchema.optional(),
});

export const plannerIntakeReadySchema = z.object({
  status: z.literal("ready"),
  request: planningRequestSchema,
});

export const plannerIntakeResultSchema = z.discriminatedUnion("status", [
  plannerIntakeNeedsInputSchema,
  plannerIntakeReadySchema,
]);

export const extractedIntakeSchema = z.object({
  festival: z.string().nullable(),
  canonicalFestival: z.string().nullable(),
  city: z.string().nullable(),
  year: z.number().int().min(1900).max(2200).nullable(),
  yearWasExplicit: z.boolean(),
  visitDates: z.array(z.string()).nullable(),
  durationDays: z.number().int().positive().nullable(),
  durationHours: z.number().int().positive().nullable(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  preferredAreas: z.array(z.string()),
  transport: z.string().nullable(),
  budget: z.string().nullable(),
  foodPreferences: z.array(z.string()),
  crowdPreference: z.string().nullable(),
  walkingTolerance: z.string().nullable(),
  otherPreferences: strictOtherPreferencesSchema,
  festivalAmbiguous: z.boolean(),
  cityAmbiguous: z.boolean(),
});

export const festivalOccurrenceExtractionSchema = z.object({
  found: z.boolean(),
  start: isoDateSchema.nullable(),
  end: isoDateSchema.nullable(),
  heldInCity: z.boolean().nullable(),
  notes: z.string().nullable(),
});

export const visitDateResolutionSchema = z.object({
  visitDates: z.array(isoDateSchema).nullable(),
});

export type FestivalDates = z.output<typeof festivalDatesSchema>;
export type PlanningRequest = z.output<typeof planningRequestSchema>;
export type PlannerIntakeInputPrompt = z.output<
  typeof plannerIntakeInputPromptSchema
>;
export type PlannerIntakeResult = z.output<typeof plannerIntakeResultSchema>;
export type ExtractedIntake = z.output<typeof extractedIntakeSchema>;
export type FestivalOccurrenceExtraction = z.output<
  typeof festivalOccurrenceExtractionSchema
>;

export function emptyPlanningRequest(): PlanningRequest {
  return {
    festival: null,
    canonicalFestival: null,
    city: null,
    year: null,
    festivalDates: null,
    visitDates: null,
    durationDays: null,
    durationHours: null,
    startTime: null,
    endTime: null,
    preferredAreas: [],
    transport: null,
    budget: null,
    foodPreferences: [],
    crowdPreference: null,
    walkingTolerance: null,
    otherPreferences: {},
  };
}
