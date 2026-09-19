import { z } from "zod";
import { prisma } from "@/db";
import { toNullableJson } from "./json";

const idSchema = z.string().min(1, "id is required");
const planIdSchema = z.string().min(1, "planId is required");
const jsonValueSchema = z.unknown().nullable().optional();

const researchRunStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
]);
const researchRunTypeSchema = z.enum([
  "initial_generation",
  "regeneration",
  "refresh",
]);

const researchRunCreateSchema = z.object({
  planId: planIdSchema,
  status: researchRunStatusSchema.default("queued"),
  runType: researchRunTypeSchema,
  startedAt: z.coerce.date().nullable().optional(),
  completedAt: z.coerce.date().nullable().optional(),
  error: z.string().min(1).nullable().optional(),
  metadata: jsonValueSchema,
});

export type ResearchRunCreateInput = z.input<typeof researchRunCreateSchema>;

export async function createResearchRun(input: ResearchRunCreateInput) {
  const { metadata, ...data } = researchRunCreateSchema.parse(input);

  return prisma.researchRun.create({
    data: {
      ...data,
      metadata: toNullableJson(metadata),
    },
  });
}

export async function findInitialGenerationByPlanId(planId: string) {
  return prisma.researchRun.findFirst({
    where: {
      planId: planIdSchema.parse(planId),
      runType: "initial_generation",
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateResearchRunStatus(
  id: string,
  status: z.input<typeof researchRunStatusSchema>,
) {
  return prisma.researchRun.update({
    where: { id: idSchema.parse(id) },
    data: { status: researchRunStatusSchema.parse(status) },
  });
}

export async function startResearchRun(id: string) {
  const runId = idSchema.parse(id);
  const existing = await prisma.researchRun.findUnique({
    where: { id: runId },
  });

  if (!existing) {
    throw new Error(`Research run not found: ${runId}`);
  }

  if (existing.status === "running" && existing.startedAt) {
    return existing;
  }

  return prisma.researchRun.update({
    where: { id: runId },
    data: {
      status: "running",
      startedAt: existing.startedAt ?? new Date(),
      completedAt: null,
      error: null,
    },
  });
}

export async function completeResearchRun(id: string, metadata?: unknown) {
  return prisma.researchRun.update({
    where: { id: idSchema.parse(id) },
    data: {
      status: "completed",
      completedAt: new Date(),
      error: null,
      ...(metadata === undefined
        ? {}
        : { metadata: toNullableJson(jsonValueSchema.parse(metadata) ?? null) }),
    },
  });
}

export async function failResearchRun(id: string, error: string) {
  return prisma.researchRun.update({
    where: { id: idSchema.parse(id) },
    data: {
      status: "failed",
      completedAt: new Date(),
      error: z.string().min(1).parse(error),
    },
  });
}
