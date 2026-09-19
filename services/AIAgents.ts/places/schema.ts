import { z } from "zod";
import { normalizedPlaceSchema } from "@/services/planner/normalize/place";

export const pandalPlaceTypeSchema = z.enum([
  "pandal",
  "temple",
  "parking",
  "restroom",
  "atm",
  "pharmacy",
  "event",
  "other",
]);

export const researchedPandalPlaceSchema = normalizedPlaceSchema
  .omit({ hours: true, metadata: true })
  .extend({
    type: pandalPlaceTypeSchema.nullable(),
    hours: z.null(),
    metadata: z.null(),
  });

export const researchedContentSchema = z.object({
  url: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  content: z.string(),
});

export const placeResearchInputSchema = z.object({
  city: z.string().min(1),
  festival: z.string().min(1).optional(),
  area: z.string().min(1).optional(),
  sources: z.array(researchedContentSchema),
});

export const placeResearchResultSchema = z.object({
  places: z.array(researchedPandalPlaceSchema),
});

export type PlaceResearchInput = z.input<typeof placeResearchInputSchema>;
export type PlaceResearchResult = z.output<typeof placeResearchResultSchema>;
