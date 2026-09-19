import { z } from "zod";
import { isoDateSchema } from "@/services/AIAgents.ts/planner-intake/schema";

export const festivalSourceSchema = z.object({
  title: z.string().nullable(),
  url: z.string().nullable(),
  snippet: z.string().nullable(),
});

export const festivalImportantDaySchema = z.object({
  name: z.string().min(1),
  date: isoDateSchema.nullable(),
  notes: z.string().nullable(),
});

export const festivalTimingSchema = z.object({
  label: z.string().min(1),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  notes: z.string().nullable(),
});

export const festivalFactsSchema = z.object({
  festivalName: z.string().nullable(),
  year: z.number().int().min(1900).max(2200).nullable(),
  city: z.string().nullable(),
  startDate: isoDateSchema.nullable(),
  endDate: isoDateSchema.nullable(),
  importantDays: z.array(festivalImportantDaySchema),
  legacy: z.string().nullable(),
  timings: z.array(festivalTimingSchema),
  sources: z.array(festivalSourceSchema),
});

export const researchedContentSchema = z.object({
  url: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  content: z.string(),
});

export const festivalFactsInputSchema = z.object({
  festival: z.string().min(1),
  city: z.string().min(1),
  year: z.number().int().min(1900).max(2200),
  sources: z.array(researchedContentSchema),
});

export type FestivalFacts = z.output<typeof festivalFactsSchema>;
export type FestivalFactsInput = z.input<typeof festivalFactsInputSchema>;
