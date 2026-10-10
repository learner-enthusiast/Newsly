import type { Prisma } from "@/db/generated/client";
import { z } from "zod";
import { prisma } from "@/db";

const stockResearchIdSchema = z.string().min(1, "stockResearchId is required");
const stockResearchResourceIdSchema = z.string().min(1, "id is required");
const researchSourceIdSchema = z.uuid();

export const stockResearchProviderSchema = z.enum([
  "UPSTOX",
  "SERP",
  "FIRECRAWL",
  "NEWS",
  "AI",
  "INTERNAL",
]);

export const stockResearchResourceTypeSchema = z.enum([
  "MARKET_DATA",
  "FUNDAMENTAL",
  "NEWS",
  "WEB_PAGE",
  "OPTIONS",
  "HISTORICAL",
  "SYNTHESIS",
  "OTHER",
]);

const inputJsonSchema = z.custom<Prisma.InputJsonValue>(
  (value) => value !== undefined,
);

const stockResearchResourceWriteSchema = z.object({
  stockResearchId: stockResearchIdSchema,
  provider: stockResearchProviderSchema,
  type: stockResearchResourceTypeSchema,
  title: z.string().min(1).nullable().optional(),
  url: z.string().url().nullable().optional(),
  externalId: z.string().min(1).nullable().optional(),
  content: z.string().nullable().optional(),
  rawData: inputJsonSchema.nullable().optional(),
  metadata: inputJsonSchema.nullable().optional(),
  researchSourceId: researchSourceIdSchema.nullable().optional(),
  contentHash: z.string().min(1).nullable().optional(),
});

const stockResearchResourcePutSchema = stockResearchResourceWriteSchema.omit({
  stockResearchId: true,
});
const stockResearchResourcePatchSchema =
  stockResearchResourcePutSchema.partial();

export type StockResearchResourceCreateInput = z.input<
  typeof stockResearchResourceWriteSchema
>;
export type StockResearchResourcePutInput = z.input<
  typeof stockResearchResourcePutSchema
>;
export type StockResearchResourcePatchInput = z.input<
  typeof stockResearchResourcePatchSchema
>;

function toCreateData(
  input: z.infer<typeof stockResearchResourceWriteSchema>,
): Prisma.StockResearchResourceUncheckedCreateInput {
  return input as Prisma.StockResearchResourceUncheckedCreateInput;
}

function toUpdateData(
  input: Prisma.StockResearchResourceUpdateInput,
): Prisma.StockResearchResourceUpdateInput {
  return input;
}

export async function createStockResearchResource(
  input: StockResearchResourceCreateInput,
) {
  return await prisma.stockResearchResource.create({
    data: toCreateData(stockResearchResourceWriteSchema.parse(input)),
  });
}

export async function getStockResearchResourceById(id: string) {
  return await prisma.stockResearchResource.findUnique({
    where: { id: stockResearchResourceIdSchema.parse(id) },
  });
}

export async function listStockResearchResourcesByResearchId(
  stockResearchId: string,
) {
  return await prisma.stockResearchResource.findMany({
    where: { stockResearchId: stockResearchIdSchema.parse(stockResearchId) },
    orderBy: { createdAt: "asc" },
  });
}

export async function patchStockResearchResource(
  id: string,
  input: StockResearchResourcePatchInput,
) {
  return await prisma.stockResearchResource.update({
    where: { id: stockResearchResourceIdSchema.parse(id) },
    data: toUpdateData(
      stockResearchResourcePatchSchema.parse(
        input,
      ) as Prisma.StockResearchResourceUpdateInput,
    ),
  });
}

/** Idempotent insert when contentHash is set (unique per research + provider). */
export async function upsertStockResearchResourceByHash(
  input: StockResearchResourceCreateInput,
) {
  const data = stockResearchResourceWriteSchema.parse(input);
  if (!data.contentHash) {
    return await prisma.stockResearchResource.create({ data: toCreateData(data) });
  }

  const { stockResearchId, provider, contentHash, ...update } = data;
  return await prisma.stockResearchResource.upsert({
    where: {
      stockResearchId_provider_contentHash: {
        stockResearchId,
        provider,
        contentHash,
      },
    },
    create: toCreateData(data),
    update: toUpdateData(update as Prisma.StockResearchResourceUpdateInput),
  });
}
