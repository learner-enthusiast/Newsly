import { z } from "zod";
import { prisma } from "@/db";
import { toNullableJson } from "./json";

const planIdSchema = z.string().min(1, "planId is required");
const jsonValueSchema = z.unknown().nullable().optional();

const planMessageRoleSchema = z.enum(["user", "assistant"]);

const planMessageCreateSchema = z.object({
  planId: planIdSchema,
  role: planMessageRoleSchema,
  content: z.string().min(1),
  messageData: jsonValueSchema,
});

export type PlanMessageCreateInput = z.input<typeof planMessageCreateSchema>;

export async function createMessage(input: PlanMessageCreateInput) {
  const { messageData, ...data } = planMessageCreateSchema.parse(input);

  return prisma.planMessage.create({
    data: {
      ...data,
      messageData: toNullableJson(messageData),
    },
  });
}

export async function createMessages(input: PlanMessageCreateInput[]) {
  const parsed = z.array(planMessageCreateSchema).parse(input);

  if (parsed.length === 0) {
    return [];
  }

  return prisma.planMessage.createManyAndReturn({
    data: parsed.map(({ messageData, ...data }) => ({
      ...data,
      messageData: toNullableJson(messageData),
    })),
  });
}

export async function getPlanMessages(planId: string) {
  return prisma.planMessage.findMany({
    where: { planId: planIdSchema.parse(planId) },
    orderBy: { createdAt: "asc" },
  });
}
