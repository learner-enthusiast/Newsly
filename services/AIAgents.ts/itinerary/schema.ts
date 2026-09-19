import { z } from "zod";
import { isoDateSchema } from "@/services/AIAgents.ts/planner-intake/schema";
import { normalizedPlaceSchema } from "@/services/planner/normalize/place";

export const itineraryPlaceSchema = normalizedPlaceSchema.pick({
  name: true,
  type: true,
  address: true,
  city: true,
  area: true,
});

export const itineraryDayInputSchema = z.object({
  dayNumber: z.number().int().positive(),
  date: isoDateSchema.nullable().optional(),
  places: z.array(itineraryPlaceSchema),
});

export const itineraryCopyInputSchema = z.object({
  festival: z.string().min(1),
  city: z.string().min(1),
  year: z.number().int().min(1900).max(2200),
  days: z.array(itineraryDayInputSchema).min(1),
});

export const itineraryDayCopySchema = z.object({
  dayNumber: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().min(1),
});

export const itineraryCopyResultSchema = z.object({
  days: z.array(itineraryDayCopySchema),
});

export type ItineraryCopyInput = z.input<typeof itineraryCopyInputSchema>;
export type ItineraryCopyResult = z.output<typeof itineraryCopyResultSchema>;
