import { NextResponse } from "next/server";
import { z } from "zod";
import { requireProApiUser } from "@/lib/requireProApiUser";
import {
  listUserStockResearchesPage,
  startStockResearch,
  startStockResearchBodySchema,
  StockResearchInputError,
} from "@/services/stockResearch/apiService";
import { researchAssetTypeSchema } from "@/repositories/stockResearch";
import {
  STOCK_RESEARCHES_MAX_LIMIT,
  STOCK_RESEARCHES_PAGE_SIZE,
} from "@/services/stockResearch/stockResearchTypes";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(STOCK_RESEARCHES_MAX_LIMIT)
    .default(STOCK_RESEARCHES_PAGE_SIZE),
  assetType: researchAssetTypeSchema.optional(),
});

/** Recent stock researches, newest first. `?page=&limit=` (limit ≤ 10). */
export async function GET(request: Request) {
  const { user, response } = await requireProApiUser();
  if (!user) {
    return response;
  }

  const { searchParams } = new URL(request.url);
  const parsed = listQuerySchema.safeParse({
    page: searchParams.get("page") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    assetType: searchParams.get("assetType") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters" },
      { status: 400 },
    );
  }

  const result = await listUserStockResearchesPage({
    userId: user.id,
    page: parsed.data.page,
    limit: parsed.data.limit,
    assetType: parsed.data.assetType,
  });
  return NextResponse.json(result);
}

/** Create a PENDING stock research and start the pipeline. */
export async function POST(request: Request) {
  const { user, response } = await requireProApiUser();
  if (!user) {
    return response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = startStockResearchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Validation failed",
        details: z.treeifyError(parsed.error),
      },
      { status: 400 },
    );
  }

  try {
    const stockResearch = await startStockResearch(user.id, parsed.data);
    return NextResponse.json({ stockResearch }, { status: 201 });
  } catch (error) {
    if (error instanceof StockResearchInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message =
      error instanceof Error ? error.message : "Failed to start research";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
