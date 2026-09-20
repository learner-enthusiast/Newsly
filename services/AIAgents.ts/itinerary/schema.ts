import { z } from "zod";
import { isoDateSchema } from "@/services/AIAgents.ts/planner-intake/schema";

/**
 * The itinerary agent receives a finished, validated route and only writes
 * prose for it — hence inputs carry timing/area/transport context but no
 * candidate pools, and outputs carry no place data.
 */
export const itineraryStopInputSchema = z.object({
  position: z.number().int().min(0),
  name: z.string().min(1),
  type: z.string(),
  role: z.enum(["festival", "food"]),
  area: z.string().nullable(),
  arrives: z.string().nullable(),
  stayMinutes: z.number().int().positive().nullable(),
  mealWindow: z.string().nullable(),
  travelFromPrevious: z.string().nullable(),
});

export const itineraryWeatherSchema = z.object({
  condition: z.string().nullable(),
  temperatureMin: z.number().nullable(),
  temperatureMax: z.number().nullable(),
  rainProbability: z.number().nullable(),
  forecastAvailable: z.boolean(),
});

export const itineraryDayInputSchema = z.object({
  dayNumber: z.number().int().positive(),
  date: isoDateSchema.nullable().optional(),
  area: z.string().nullable(),
  window: z.string().nullable(),
  transport: z.string().nullable(),
  transportExplicit: z.boolean().optional(),
  weather: itineraryWeatherSchema.nullable().optional(),
  stops: z.array(itineraryStopInputSchema),
});

export const itineraryCopyInputSchema = z.object({
  festival: z.string().min(1),
  city: z.string().min(1),
  year: z.number().int().min(1900).max(2200),
  days: z.array(itineraryDayInputSchema).min(1),
});

export const itineraryStopCopySchema = z.object({
  position: z.number().int().min(0),
  note: z.string().min(1),
});

export const itineraryDayCopySchema = z.object({
  dayNumber: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().min(1),
  stops: z.array(itineraryStopCopySchema),
});

export const itineraryCopyResultSchema = z.object({
  days: z.array(itineraryDayCopySchema),
});

export type ItineraryStopInput = z.input<typeof itineraryStopInputSchema>;
export type ItineraryCopyInput = z.input<typeof itineraryCopyInputSchema>;
export type ItineraryCopyResult = z.output<typeof itineraryCopyResultSchema>;
