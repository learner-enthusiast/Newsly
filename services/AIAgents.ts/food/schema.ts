import { z } from "zod";
import {
  foodPlaceTypeSchema,
  normalizedPlaceSchema,
} from "@/services/planner/normalize/place";

export const researchedContentSchema = z.object({
  url: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  content: z.string(),
});

export const researchedFoodPlaceSchema = normalizedPlaceSchema
  .omit({ hours: true, metadata: true })
  .extend({
    type: foodPlaceTypeSchema.nullable(),
    hours: z.null(),
    metadata: z.null(),
  });

export const foodResearchInputSchema = z.object({
  city: z.string().min(1),
  festival: z.string().min(1).optional(),
  area: z.string().min(1).optional(),
  sources: z.array(researchedContentSchema),
});

export const foodResearchResultSchema = z.object({
  places: z.array(researchedFoodPlaceSchema),
});

export type FoodResearchInput = z.input<typeof foodResearchInputSchema>;
export type FoodResearchResult = z.output<typeof foodResearchResultSchema>;
