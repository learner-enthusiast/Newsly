import { z } from "zod";
import { prisma } from "@/db";
import { toNullableJson } from "./json";

const idSchema = z.string().min(1, "id is required");
const researchRunIdSchema = z.string().min(1, "researchRunId is required");
const jsonValueSchema = z.unknown().nullable().optional();

const researchSourceTypeSchema = z.enum([
  "google_search",
  "google_maps",
  "official",
  "news",
  "website",
  "blog",
  "other",
]);

const researchSourceCreateSchema = z.object({
  researchRunId: researchRunIdSchema,
  url: z.string().min(1),
  title: z.string().min(1).nullable().optional(),
  sourceType: researchSourceTypeSchema,
  searchQuery: z.string().min(1).nullable().optional(),
  snippet: z.string().min(1).nullable().optional(),
  content: z.string().min(1).nullable().optional(),
  contentHash: z.string().min(1).nullable().optional(),
  retrievedAt: z.coerce.date().nullable().optional(),
  metadata: jsonValueSchema,
});

export type ResearchSourceCreateInput = z.input<
  typeof researchSourceCreateSchema
>;

export async function createSource(input: ResearchSourceCreateInput) {
  const { metadata, ...data } = researchSourceCreateSchema.parse(input);

  return prisma.researchSource.create({
    data: {
      ...data,
      metadata: toNullableJson(metadata),
    },
  });
}

export async function createSources(input: ResearchSourceCreateInput[]) {
  const parsed = z.array(researchSourceCreateSchema).parse(input);

  if (parsed.length === 0) {
    return [];
  }

  return prisma.researchSource.createManyAndReturn({
    data: parsed.map(({ metadata, ...data }) => ({
      ...data,
      metadata: toNullableJson(metadata),
    })),
  });
}

export async function findByContentHash(contentHash: string) {
  return prisma.researchSource.findFirst({
    where: { contentHash: z.string().min(1).parse(contentHash) },
  });
}

export async function findByRunIdAndUrl(researchRunId: string, url: string) {
  return prisma.researchSource.findFirst({
    where: {
      researchRunId: researchRunIdSchema.parse(researchRunId),
      url: z.string().min(1).parse(url),
    },
  });
}

export async function findByRunIdAndContentHash(
  researchRunId: string,
  contentHash: string,
) {
  return prisma.researchSource.findFirst({
    where: {
      researchRunId: researchRunIdSchema.parse(researchRunId),
      contentHash: z.string().min(1).parse(contentHash),
    },
  });
}

export async function getSourcesByRunId(researchRunId: string) {
  return prisma.researchSource.findMany({
    where: { researchRunId: researchRunIdSchema.parse(researchRunId) },
    orderBy: { createdAt: "asc" },
  });
}

const researchSourceUpdateSchema = researchSourceCreateSchema
  .omit({ researchRunId: true })
  .partial();

export type ResearchSourceUpdateInput = z.input<typeof researchSourceUpdateSchema>;

export async function updateSource(id: string, input: ResearchSourceUpdateInput) {
  const { metadata, ...data } = researchSourceUpdateSchema.parse(input);

  return prisma.researchSource.update({
    where: { id: idSchema.parse(id) },
    data: {
      ...data,
      ...(metadata === undefined ? {} : { metadata: toNullableJson(metadata) }),
    },
  });
}
