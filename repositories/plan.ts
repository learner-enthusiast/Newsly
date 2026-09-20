import { z } from "zod";
import { prisma } from "@/db";
import { toNullableJson } from "./json";

const idSchema = z.string().min(1, "id is required");
const userIdSchema = z.string().min(1, "userId is required");
const slugSchema = z.string().min(1, "slug is required");
const jsonValueSchema = z.unknown().nullable().optional();

const planStatusSchema = z.enum([
  "draft",
  "processing",
  "ready",
  "failed",
  "archived",
]);
const planVisibilitySchema = z.enum(["private", "public"]);

const planCreateSchema = z.object({
  userId: userIdSchema,
  slug: slugSchema,
  title: z.string().min(1),
  description: z.string().min(1).nullable().optional(),
  festivalName: z.string().min(1),
  city: z.string().min(1),
  country: z.string().min(1),
  year: z.number().int().min(1900).max(2200),
  status: planStatusSchema,
  visibility: planVisibilitySchema,
  requestData: jsonValueSchema,
  weather: jsonValueSchema,
});

export type PlanCreateInput = z.input<typeof planCreateSchema>;

export async function createPlan(input: PlanCreateInput) {
  const { requestData, weather, ...data } = planCreateSchema.parse(input);

  return prisma.plan.create({
    data: {
      ...data,
      requestData: toNullableJson(requestData),
      weather: toNullableJson(weather),
    },
  });
}

const planListSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  festivalName: true,
  city: true,
  country: true,
  year: true,
  status: true,
  visibility: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type PlanListRecord = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  festivalName: string;
  city: string;
  country: string;
  year: number;
  status: z.infer<typeof planStatusSchema>;
  visibility: z.infer<typeof planVisibilitySchema>;
  createdAt: Date;
  updatedAt: Date;
};

export async function listPlansByUserId(userId: string): Promise<PlanListRecord[]> {
  return prisma.plan.findMany({
    where: { userId: userIdSchema.parse(userId) },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: planListSelect,
  });
}

export async function getPlanById(id: string) {
  return prisma.plan.findUnique({
    where: { id: idSchema.parse(id) },
  });
}

export async function getPlanBySlug(slug: string) {
  return prisma.plan.findFirst({
    where: { slug: slugSchema.parse(slug) },
  });
}

export async function getPlanByUserIdAndSlug(userId: string, slug: string) {
  return prisma.plan.findUnique({
    where: {
      userId_slug: {
        userId: userIdSchema.parse(userId),
        slug: slugSchema.parse(slug),
      },
    },
  });
}

export async function updatePlanStatus(
  id: string,
  status: z.input<typeof planStatusSchema>,
) {
  return prisma.plan.update({
    where: { id: idSchema.parse(id) },
    data: { status: planStatusSchema.parse(status) },
  });
}

export async function updatePlanDescription(
  id: string,
  input: { title?: string; description: string },
) {
  const data = z
    .object({
      title: z.string().min(1).optional(),
      description: z.string().min(1, "description is required"),
    })
    .parse(input);

  return prisma.plan.update({
    where: { id: idSchema.parse(id) },
    data,
  });
}

export async function updatePlanRequestData(id: string, requestData: unknown) {
  return prisma.plan.update({
    where: { id: idSchema.parse(id) },
    data: { requestData: toNullableJson(jsonValueSchema.parse(requestData) ?? null) },
  });
}

export async function updatePlanWeather(id: string, weather: unknown) {
  return prisma.plan.update({
    where: { id: idSchema.parse(id) },
    data: { weather: toNullableJson(jsonValueSchema.parse(weather) ?? null) },
  });
}
