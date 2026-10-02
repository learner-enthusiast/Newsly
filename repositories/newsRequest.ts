import { z } from "zod";
import { prisma } from "@/db";
import { newsScopeSchema } from "@/lib/newsScope";
import { newsSearchQuerySchema } from "@/lib/newsSearchQuerySchema";

const newsRequestIdSchema = z.uuid("id must be a uuid");
const userIdSchema = z.string().min(1, "userId is required");

export { newsScopeSchema };
export { newsSearchQuerySchema };
export const newsRequestStatusSchema = z.enum(["pending", "failed", "success"]);

const newsRequestWriteSchema = z.object({
  userId: userIdSchema,
  date: z.coerce.date(),
  location: z.string().min(1).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  scope: newsScopeSchema,
  searchQuery: newsSearchQuerySchema,
  status: newsRequestStatusSchema,
  error: z.string().nullable().optional(),
  completedAt: z.coerce.date().nullable().optional(),
  loadingLogs: z.array(z.string()).optional(),
  storyCount: z.number().int().min(1).max(12).optional(),
  categories: z.array(z.string().min(1).max(80)).optional(),
  customQuery: z.string().min(1).nullable().optional(),
  language: z.string().min(1).nullable().optional(),
  sources: z.array(z.string().min(1).max(200)).optional(),
  isRerunning: z.boolean().optional(),
});

const newsRequestPutSchema = newsRequestWriteSchema.omit({ userId: true });
const newsRequestPatchSchema = newsRequestPutSchema
  .partial()
  .extend({
    loadingLogs: z
      .union([z.array(z.string()), z.object({ push: z.string().min(1) })])
      .optional(),
  });

export type NewsRequestCreateInput = z.input<typeof newsRequestWriteSchema>;
export type NewsRequestPutInput = z.input<typeof newsRequestPutSchema>;
export type NewsRequestPatchInput = z.input<typeof newsRequestPatchSchema>;

export async function createNewsRequest(input: NewsRequestCreateInput) {
  return prisma.newsRequest.create({
    data: newsRequestWriteSchema.parse(input),
  });
}

export async function getNewsRequestById(id: string) {
  return prisma.newsRequest.findUnique({
    where: { id: newsRequestIdSchema.parse(id) },
  });
}

export async function getNewsRequestByIdForUser(id: string, userId: string) {
  return prisma.newsRequest.findFirst({
    where: {
      id: newsRequestIdSchema.parse(id),
      userId: userIdSchema.parse(userId),
    },
  });
}

const findNewsRequestInputSchema = z
  .object({
    userId: userIdSchema,
    date: z.coerce.date(),
    scope: newsScopeSchema,
    location: z.string().min(1).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const needsLocation = data.scope === "local" || data.scope === "both";
    if (needsLocation && !data.location?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "location is required when scope is local or both",
        path: ["location"],
      });
    }
  });

export type FindNewsRequestInput = z.input<typeof findNewsRequestInputSchema>;

/** Same user + calendar date + scope + location (null for world). */
export async function findNewsRequestByUserScopeDate(
  input: FindNewsRequestInput,
) {
  const parsed = findNewsRequestInputSchema.parse(input);
  const location =
    parsed.scope === "world" ? null : parsed.location?.trim() ?? null;

  return prisma.newsRequest.findFirst({
    where: {
      userId: parsed.userId,
      date: parsed.date,
      scope: parsed.scope,
      location,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function putNewsRequest(id: string, input: NewsRequestPutInput) {
  return prisma.newsRequest.update({
    where: { id: newsRequestIdSchema.parse(id) },
    data: newsRequestPutSchema.parse(input),
  });
}

export async function patchNewsRequest(id: string, input: NewsRequestPatchInput) {
  return prisma.newsRequest.update({
    where: { id: newsRequestIdSchema.parse(id) },
    data: newsRequestPatchSchema.parse(input),
  });
}

export async function setNewsRequestIsRerunning(
  id: string,
  isRerunning: boolean,
) {
  return prisma.newsRequest.update({
    where: { id: newsRequestIdSchema.parse(id) },
    data: { isRerunning: z.boolean().parse(isRerunning) },
  });
}

export async function appendNewsRequestLoadingLog(id: string, message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return null;
  }
  return prisma.newsRequest.update({
    where: { id: newsRequestIdSchema.parse(id) },
    data: {
      loadingLogs: { push: trimmed },
    },
  });
}

export async function listRecentNewsRequestsByUserId(
  userId: string,
  take: number,
) {
  return prisma.newsRequest.findMany({
    where: { userId: userIdSchema.parse(userId) },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, take),
  });
}

export async function listNewsRequestsByUserIdPage(input: {
  userId: string;
  skip: number;
  take: number;
}) {
  const userId = userIdSchema.parse(input.userId);
  const take = Math.max(1, input.take);
  const skip = Math.max(0, input.skip);

  const [total, rows] = await prisma.$transaction([
    prisma.newsRequest.count({ where: { userId } }),
    prisma.newsRequest.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
  ]);

  return { total, rows };
}

export async function deleteNewsRequest(id: string) {
  return prisma.newsRequest.delete({
    where: { id: newsRequestIdSchema.parse(id) },
  });
}
