import { z } from "zod";

/** Validates top-level fields on each entry in `festivals.ts`. */
export const festivalSeedRecordSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().min(1),
  historical_facts: z.unknown().optional(),
  cultural_context: z.unknown().optional(),
  planning_profile: z.unknown().optional(),
  cities: z.unknown().optional(),
  search_taxonomy: z.unknown().optional(),
  rituals: z.unknown().optional(),
  terminology: z.unknown().optional(),
  date_information: z.unknown().optional(),
  transport_profile: z.unknown().optional(),
  crowd_profile: z.unknown().optional(),
  food_profile: z.unknown().optional(),
  research_rules: z.unknown().optional(),
  sources: z.unknown().optional(),
  metadata: z.unknown().optional(),
  festival_modes: z.unknown().optional(),
});

export type FestivalSeedRecord = z.output<typeof festivalSeedRecordSchema>;
