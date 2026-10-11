import type { Prisma } from "@/db/generated/client";
import { Prisma as PrismaRuntime } from "@/db/generated/client";
import { z } from "zod";
import { prisma } from "@/db";

const stockResearchIdSchema = z.string().min(1, "id is required");
const userIdSchema = z.string().min(1, "userId is required");

export const researchAssetTypeSchema = z.enum(["STOCK", "ETF", "MUTUAL_FUND"]);

export const stockResearchStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "RERUNNING",
  "COMPLETED",
  "FAILED",
]);

const inputJsonSchema = z.custom<Prisma.InputJsonValue>(
  (value) => value !== undefined,
);

const stockResearchWriteSchema = z.object({
  userId: userIdSchema,
  companyName: z.string().min(1).nullable().optional(),
  symbol: z.string().min(1).nullable().optional(),
  exchange: z.string().min(1).nullable().optional(),
  isin: z.string().min(1).nullable().optional(),
  instrumentKey: z.string().min(1).nullable().optional(),
  userPrompt: z.string().min(1).nullable().optional(),
  assetType: researchAssetTypeSchema.optional(),
  query: z.string().min(1),
  status: stockResearchStatusSchema.optional(),
  runCount: z.number().int().min(0).optional(),
  determinerPlan: inputJsonSchema.nullable().optional(),
  report: inputJsonSchema.nullable().optional(),
  reportMarkdown: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  startedAt: z.coerce.date().nullable().optional(),
  completedAt: z.coerce.date().nullable().optional(),
  loadingLogs: z.array(z.string()).optional(),
});

const stockResearchPutSchema = stockResearchWriteSchema.omit({ userId: true });
const stockResearchPatchSchema = stockResearchPutSchema
  .partial()
  .extend({
    loadingLogs: z
      .union([z.array(z.string()), z.object({ push: z.string().min(1) })])
      .optional(),
  });

export type StockResearchCreateInput = z.input<typeof stockResearchWriteSchema>;
export type StockResearchPutInput = z.input<typeof stockResearchPutSchema>;
export type StockResearchPatchInput = z.input<typeof stockResearchPatchSchema>;

function toCreateData(
  input: z.infer<typeof stockResearchWriteSchema>,
): Prisma.StockResearchUncheckedCreateInput {
  return input as Prisma.StockResearchUncheckedCreateInput;
}

function toUpdateData(
  input: Prisma.StockResearchUpdateInput,
): Prisma.StockResearchUpdateInput {
  return input;
}

export async function createStockResearch(input: StockResearchCreateInput) {
  return await prisma.stockResearch.create({
    data: toCreateData(stockResearchWriteSchema.parse(input)),
  });
}

export async function getStockResearchById(id: string) {
  return await prisma.stockResearch.findUnique({
    where: { id: stockResearchIdSchema.parse(id) },
  });
}

export async function getStockResearchByIdForUser(id: string, userId: string) {
  return await prisma.stockResearch.findFirst({
    where: {
      id: stockResearchIdSchema.parse(id),
      userId: userIdSchema.parse(userId),
    },
  });
}

export async function getStockResearchWithResourcesByIdForUser(
  id: string,
  userId: string,
) {
  return await prisma.stockResearch.findFirst({
    where: {
      id: stockResearchIdSchema.parse(id),
      userId: userIdSchema.parse(userId),
    },
    include: {
      resources: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function listStockResearchesByUserId(
  userId: string,
  options?: { limit?: number; status?: z.infer<typeof stockResearchStatusSchema> },
) {
  const parsedUserId = userIdSchema.parse(userId);
  const limit = options?.limit ?? 50;
  return await prisma.stockResearch.findMany({
    where: {
      userId: parsedUserId,
      ...(options?.status ? { status: options.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Newest-first page of a user's researches plus the total row count. */
export async function listStockResearchesByUserIdPage(input: {
  userId: string;
  skip: number;
  take: number;
  assetType?: z.infer<typeof researchAssetTypeSchema>;
}) {
  const where = {
    userId: userIdSchema.parse(input.userId),
    ...(input.assetType ? { assetType: input.assetType } : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.stockResearch.count({ where }),
    prisma.stockResearch.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: input.skip,
      take: input.take,
    }),
  ]);
  return { total, rows };
}

export async function patchStockResearch(
  id: string,
  input: StockResearchPatchInput,
) {
  return await prisma.stockResearch.update({
    where: { id: stockResearchIdSchema.parse(id) },
    data: toUpdateData(
      stockResearchPatchSchema.parse(input) as Prisma.StockResearchUpdateInput,
    ),
  });
}

export async function patchStockResearchForUser(
  id: string,
  userId: string,
  input: StockResearchPatchInput,
) {
  const existing = await getStockResearchByIdForUser(id, userId);
  if (!existing) {
    return null;
  }
  return await patchStockResearch(id, input);
}

export async function appendStockResearchLoadingLog(
  id: string,
  message: string,
) {
  const trimmed = message.trim();
  if (!trimmed) {
    return null;
  }
  return await prisma.stockResearch.update({
    where: { id: stockResearchIdSchema.parse(id) },
    data: {
      loadingLogs: { push: trimmed },
    },
  });
}

/** Replace the full progress log (e.g. pipeline rerun reset). */
export async function setStockResearchLoadingLogs(
  id: string,
  loadingLogs: string[],
) {
  const parsed = z.array(z.string()).parse(loadingLogs);
  return await prisma.stockResearch.update({
    where: { id: stockResearchIdSchema.parse(id) },
    data: { loadingLogs: parsed },
  });
}

/** Mark run start: increments runCount and sets status RUNNING or RERUNNING. */
export async function markStockResearchRunStarted(id: string) {
  const existing = await getStockResearchById(id);
  if (!existing) {
    return null;
  }
  const nextStatus =
    existing.status === "COMPLETED" ||
    existing.status === "FAILED" ||
    existing.runCount > 0
      ? "RERUNNING"
      : "RUNNING";

  return await prisma.stockResearch.update({
    where: { id: stockResearchIdSchema.parse(id) },
    data: {
      status: nextStatus,
      runCount: { increment: 1 },
      startedAt: new Date(),
      completedAt: null,
      error: null,
    },
  });
}

export async function markStockResearchCompleted(
  id: string,
  input: {
    report?: Prisma.InputJsonValue | null;
    reportMarkdown?: string | null;
    determinerPlan?: Prisma.InputJsonValue | null;
  } = {},
) {
  const data: Prisma.StockResearchUpdateInput = {
    status: "COMPLETED",
    completedAt: new Date(),
    error: null,
  };
  if (input.report !== undefined) {
    data.report =
      input.report === null ? PrismaRuntime.JsonNull : input.report;
  }
  if (input.reportMarkdown !== undefined) {
    data.reportMarkdown = input.reportMarkdown;
  }
  if (input.determinerPlan !== undefined) {
    data.determinerPlan =
      input.determinerPlan === null
        ? PrismaRuntime.JsonNull
        : input.determinerPlan;
  }

  return await prisma.stockResearch.update({
    where: { id: stockResearchIdSchema.parse(id) },
    data,
  });
}

export async function markStockResearchFailed(id: string, error: string) {
  return await prisma.stockResearch.update({
    where: { id: stockResearchIdSchema.parse(id) },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      error: z.string().min(1).parse(error),
    },
  });
}
