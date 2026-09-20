import { z } from "zod";
import { prisma } from "@/db";
import { toNullableJson } from "./json";

const idSchema = z.string().min(1, "id is required");
const dayIdSchema = z.string().min(1, "dayId is required");
const jsonValueSchema = z.unknown().nullable().optional();

const planItemTypeSchema = z.enum([
  "pandal",
  "food",
  "restaurant",
  "cafe",
  "parking",
  "restroom",
  "event",
  "custom",
]);

const planItemCreateSchema = z.object({
  dayId: dayIdSchema,
  placeId: z.string().min(1).nullable().optional(),
  type: planItemTypeSchema,
  position: z.number().int().min(0),
  titleOverride: z.string().min(1).nullable().optional(),
  descriptionOverride: z.string().min(1).nullable().optional(),
  startTime: z.coerce.date().nullable().optional(),
  durationMinutes: z.number().int().positive().nullable().optional(),
  notes: z.string().min(1).nullable().optional(),
  snapshot: jsonValueSchema,
});

export type PlanItemCreateInput = z.input<typeof planItemCreateSchema>;

export async function createPlanItem(input: PlanItemCreateInput) {
  const { snapshot, ...data } = planItemCreateSchema.parse(input);

  return prisma.planItem.create({
    data: {
      ...data,
      snapshot: toNullableJson(snapshot),
    },
  });
}

export async function createPlanItems(input: PlanItemCreateInput[]) {
  const parsed = z.array(planItemCreateSchema).parse(input);

  if (parsed.length === 0) {
    return [];
  }

  return prisma.planItem.createManyAndReturn({
    data: parsed.map(({ snapshot, ...data }) => ({
      ...data,
      snapshot: toNullableJson(snapshot),
    })),
  });
}

export async function getPlanItemsByDayId(dayId: string) {
  return prisma.planItem.findMany({
    where: { dayId: dayIdSchema.parse(dayId) },
    orderBy: { position: "asc" },
  });
}

const planItemUpdateSchema = planItemCreateSchema
  .partial()
  .omit({ dayId: true });

export type PlanItemUpdateInput = z.input<typeof planItemUpdateSchema>;

export async function updatePlanItem(id: string, input: PlanItemUpdateInput) {
  const { snapshot, ...data } = planItemUpdateSchema.parse(input);

  return prisma.planItem.update({
    where: { id: idSchema.parse(id) },
    data: {
      ...data,
      ...(snapshot !== undefined
        ? { snapshot: toNullableJson(snapshot) }
        : {}),
    },
  });
}

export async function updatePosition(id: string, position: number) {
  return prisma.planItem.update({
    where: { id: idSchema.parse(id) },
    data: { position: z.number().int().min(0).parse(position) },
  });
}

export async function reorderPlanItems(dayId: string, orderedItemIds: string[]) {
  const parsedDayId = dayIdSchema.parse(dayId);
  const ids = z.array(idSchema).parse(orderedItemIds);

  return prisma.$transaction(
    ids.map((id, position) =>
      prisma.planItem.update({
        where: { id, dayId: parsedDayId },
        data: { position },
      }),
    ),
  );
}

export async function movePlanItemToDay(
  itemId: string,
  targetDayId: string,
  position: number,
) {
  return prisma.planItem.update({
    where: { id: idSchema.parse(itemId) },
    data: {
      dayId: dayIdSchema.parse(targetDayId),
      position: z.number().int().min(0).parse(position),
    },
  });
}

export async function deletePlanItem(id: string) {
  return prisma.planItem.delete({
    where: { id: idSchema.parse(id) },
  });
}

export async function getNextItemPosition(dayId: string) {
  const last = await prisma.planItem.findFirst({
    where: { dayId: dayIdSchema.parse(dayId) },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  return (last?.position ?? -1) + 1;
}
