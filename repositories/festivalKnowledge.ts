import { z } from "zod";
import { prisma } from "@/db";
import { toNullableJson } from "./json";

const slugSchema = z.string().min(1, "slug is required");

const festivalKnowledgeUpsertSchema = z.object({
  name: z.string().min(1),
  slug: slugSchema,
  description: z.string().min(1),
  historicalFacts: z.unknown().nullable().optional(),
  culturalContext: z.unknown().nullable().optional(),
  planningProfile: z.unknown().nullable().optional(),
  cities: z.unknown().nullable().optional(),
  searchTaxonomy: z.unknown().nullable().optional(),
  rituals: z.unknown().nullable().optional(),
  terminology: z.unknown().nullable().optional(),
  dateInformation: z.unknown().nullable().optional(),
  transportProfile: z.unknown().nullable().optional(),
  crowdProfile: z.unknown().nullable().optional(),
  foodProfile: z.unknown().nullable().optional(),
  researchRules: z.unknown().nullable().optional(),
  sources: z.unknown().nullable().optional(),
  metadata: z.unknown().nullable().optional(),
});

export type FestivalKnowledgeUpsertInput = z.input<
  typeof festivalKnowledgeUpsertSchema
>;

function writeData(input: FestivalKnowledgeUpsertInput) {
  const parsed = festivalKnowledgeUpsertSchema.parse(input);

  return {
    name: parsed.name,
    description: parsed.description,
    historicalFacts: toNullableJson(parsed.historicalFacts),
    culturalContext: toNullableJson(parsed.culturalContext),
    planningProfile: toNullableJson(parsed.planningProfile),
    cities: toNullableJson(parsed.cities),
    searchTaxonomy: toNullableJson(parsed.searchTaxonomy),
    rituals: toNullableJson(parsed.rituals),
    terminology: toNullableJson(parsed.terminology),
    dateInformation: toNullableJson(parsed.dateInformation),
    transportProfile: toNullableJson(parsed.transportProfile),
    crowdProfile: toNullableJson(parsed.crowdProfile),
    foodProfile: toNullableJson(parsed.foodProfile),
    researchRules: toNullableJson(parsed.researchRules),
    sources: toNullableJson(parsed.sources),
    metadata: toNullableJson(parsed.metadata),
  };
}

/** Idempotent seed/load by stable festival slug. */
export async function upsertFestivalKnowledgeBySlug(
  input: FestivalKnowledgeUpsertInput,
) {
  const slug = slugSchema.parse(input.slug);
  const data = writeData(input);

  return prisma.festivalKnowledge.upsert({
    where: { slug },
    create: {
      slug,
      ...data,
    },
    update: data,
  });
}

export async function getFestivalKnowledgeBySlug(slug: string) {
  return prisma.festivalKnowledge.findUnique({
    where: { slug: slugSchema.parse(slug) },
  });
}

const festivalCityEntrySchema = z.object({
  name: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  state: z.string().nullable().optional(),
});

export type FestivalCityNameState = {
  name: string;
  state: string | null;
};

export type FestivalNameAndCities = {
  name: string;
  slug: string;
  cities: FestivalCityNameState[];
};

function parseCityEntries(cities: unknown): FestivalCityNameState[] {
  if (!Array.isArray(cities)) {
    return [];
  }

  const result: FestivalCityNameState[] = [];

  for (const entry of cities) {
    const parsed = festivalCityEntrySchema.safeParse(entry);
    if (!parsed.success) {
      continue;
    }

    const name = parsed.data.name ?? parsed.data.city;
    if (!name) {
      continue;
    }

    result.push({
      name,
      state: parsed.data.state ?? null,
    });
  }

  return result;
}

/** Festival display name plus each reference city's `name` and `state` from stored JSON. */
export async function getFestivalNamesAndCities(): Promise<FestivalNameAndCities[]> {
  const rows = await prisma.festivalKnowledge.findMany({
    select: {
      name: true,
      slug: true,
      cities: true,
    },
    orderBy: { name: "asc" },
  });

  return rows.map((row) => ({
    name: row.name,
    slug: row.slug,
    cities: parseCityEntries(row.cities),
  }));
}
