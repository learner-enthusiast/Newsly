import { z } from "zod";
import { prisma } from "@/db";

const placeIdSchema = z.string().min(1, "placeId is required");
const sourceIdSchema = z.string().min(1, "sourceId is required");

const placeSourceRelationshipTypeSchema = z.enum([
  "location",
  "rating",
  "festival",
  "timing",
  "description",
]);

const placeSourceCreateSchema = z.object({
  placeId: placeIdSchema,
  sourceId: sourceIdSchema,
  relationshipType: placeSourceRelationshipTypeSchema,
});

export type PlaceSourceCreateInput = z.input<typeof placeSourceCreateSchema>;

export async function createPlaceSource(input: PlaceSourceCreateInput) {
  const data = placeSourceCreateSchema.parse(input);
  const existing = await prisma.placeSource.findUnique({
    where: {
      placeId_sourceId: {
        placeId: data.placeId,
        sourceId: data.sourceId,
      },
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.placeSource.create({ data });
}

export async function createPlaceSources(input: PlaceSourceCreateInput[]) {
  const data = z.array(placeSourceCreateSchema).parse(input);

  if (data.length === 0) {
    return [];
  }

  await prisma.placeSource.createMany({
    data,
    skipDuplicates: true,
  });

  return prisma.placeSource.findMany({
    where: {
      OR: data.map(({ placeId, sourceId }) => ({ placeId, sourceId })),
    },
  });
}
