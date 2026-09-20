import { z } from "zod";
import type { FestivalKnowledgeUpsertInput } from "@/repositories/festivalKnowledge";
import { festivalSeedRecordSchema } from "./festivalSeedRecordSchema";

export { festivalSeedRecordSchema } from "./festivalSeedRecordSchema";
export type { FestivalSeedRecord } from "./festivalSeedRecordSchema";

function mergeMetadata(record: z.output<typeof festivalSeedRecordSchema>) {
  const base =
    record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
      ? { ...(record.metadata as Record<string, unknown>) }
      : {};

  if (record.festival_modes !== undefined) {
    base.festival_modes = record.festival_modes;
  }

  return Object.keys(base).length > 0 ? base : null;
}

export function mapFestivalSeedRecord(record: unknown): FestivalKnowledgeUpsertInput {
  const parsed = festivalSeedRecordSchema.parse(record);

  return {
    name: parsed.name,
    slug: parsed.slug,
    description: parsed.description,
    historicalFacts: parsed.historical_facts ?? null,
    culturalContext: parsed.cultural_context ?? null,
    planningProfile: parsed.planning_profile ?? null,
    cities: parsed.cities ?? null,
    searchTaxonomy: parsed.search_taxonomy ?? null,
    rituals: parsed.rituals ?? null,
    terminology: parsed.terminology ?? null,
    dateInformation: parsed.date_information ?? null,
    transportProfile: parsed.transport_profile ?? null,
    crowdProfile: parsed.crowd_profile ?? null,
    foodProfile: parsed.food_profile ?? null,
    researchRules: parsed.research_rules ?? null,
    sources: parsed.sources ?? null,
    metadata: mergeMetadata(parsed),
  };
}
