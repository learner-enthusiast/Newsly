import { z } from "zod";
import { prisma } from "@/db";

const idSchema = z.string().min(1, "id is required");
const planIdSchema = z.string().min(1, "planId is required");

const planDayCreateSchema = z.object({
  planId: planIdSchema,
  dayNumber: z.number().int().positive(),
  date: z.coerce.date().nullable().optional(),
  title: z.string().min(1),
  description: z.string().min(1).nullable().optional(),
  startTime: z.coerce.date().nullable().optional(),
  endTime: z.coerce.date().nullable().optional(),
});

export type PlanDayCreateInput = z.input<typeof planDayCreateSchema>;

export async function createPlanDay(input: PlanDayCreateInput) {
  const data = planDayCreateSchema.parse(input);

  return prisma.planDay.create({ data });
}

export async function createPlanDays(input: PlanDayCreateInput[]) {
  const data = z.array(planDayCreateSchema).parse(input);

  if (data.length === 0) {
    return [];
  }

  return prisma.planDay.createManyAndReturn({ data });
}

export async function getPlanDaysByPlanId(planId: string) {
  return prisma.planDay.findMany({
    where: { planId: idSchema.parse(planId) },
    orderBy: { dayNumber: "asc" },
  });
}
