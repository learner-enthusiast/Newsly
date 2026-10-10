import { after } from "next/server";
import type { StockResearch, StockResearchResource } from "@/db/generated/client";
import { enqueueStockResearchPipeline } from "@/inngest/stockResearch/stockResearchPipeline";
import { getInstrumentByKey } from "@/repositories/instrument";
import {
  appendStockResearchLoadingLog,
  createStockResearch,
  getStockResearchWithResourcesByIdForUser,
  listStockResearchesByUserIdPage,
  markStockResearchFailed,
} from "@/repositories/stockResearch";
import { toJsonSafeStepOutput } from "@/services/news/normalizeArticles";
import {
  STOCK_RESEARCHES_MAX_LIMIT,
  type SerializedStockResearch,
  type SerializedStockResearchResource,
  type StockResearchDetailPayload,
  type StockResearchListPayload,
} from "@/services/stockResearch/stockResearchTypes";
import { z } from "zod";

export const startStockResearchBodySchema = z.object({
  instrumentKey: z.string().trim().min(1, "Pick a stock first"),
  prompt: z
    .string()
    .trim()
    .min(3, "Describe what you want researched")
    .max(2000, "Prompt is too long"),
});

export type StartStockResearchBody = z.infer<typeof startStockResearchBodySchema>;

export function serializeStockResearch(row: StockResearch): SerializedStockResearch {
  return {
    id: row.id,
    companyName: row.companyName,
    symbol: row.symbol,
    exchange: row.exchange,
    instrumentKey: row.instrumentKey,
    userPrompt: row.userPrompt,
    query: row.query,
    status: row.status,
    reportMarkdown: row.reportMarkdown,
    error: row.error,
    loadingLogs: row.loadingLogs,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Resource metadata only — raw payloads and scraped text stay server-side. */
function serializeResource(
  row: StockResearchResource,
): SerializedStockResearchResource {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    provider: row.provider,
    type: row.type,
    title: row.title,
    url: row.url,
    source: typeof meta.source === "string" ? meta.source : null,
    tool: typeof meta.tool === "string" ? meta.tool : null,
  };
}

export class StockResearchInputError extends Error {}

/**
 * Create a PENDING research row and return it immediately. The pipeline event is
 * sent after the response, so the client can redirect to `/stockResearch/:id`
 * and poll; a failed enqueue marks the row FAILED, which the poll picks up.
 */
export async function startStockResearch(
  userId: string,
  body: StartStockResearchBody,
): Promise<SerializedStockResearch> {
  const instrument = await getInstrumentByKey(body.instrumentKey);
  if (!instrument) {
    throw new StockResearchInputError("Unknown instrument");
  }

  const row = await createStockResearch({
    userId,
    companyName: instrument.name,
    symbol: instrument.tradingSymbol,
    exchange: instrument.exchange,
    isin: instrument.isin,
    instrumentKey: instrument.instrumentKey,
    userPrompt: body.prompt,
    query: body.prompt,
    status: "PENDING",
  });

  after(async () => {
    try {
      await enqueueStockResearchPipeline({
        userId,
        stockResearchId: row.id,
        userPrompt: body.prompt,
        instrument: toJsonSafeStepOutput(instrument) as Record<string, unknown>,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to start research";
      console.error("[stock-research] enqueue failed", {
        stockResearchId: row.id,
        error: message,
      });
      await appendStockResearchLoadingLog(row.id, "Could not start research.");
      await markStockResearchFailed(row.id, message);
    }
  });

  return serializeStockResearch(row);
}

export async function listUserStockResearchesPage(input: {
  userId: string;
  page: number;
  limit: number;
}): Promise<StockResearchListPayload> {
  const limit = Math.min(Math.max(1, input.limit), STOCK_RESEARCHES_MAX_LIMIT);
  const page = Math.max(1, input.page);
  const { total, rows } = await listStockResearchesByUserIdPage({
    userId: input.userId,
    skip: (page - 1) * limit,
    take: limit,
  });

  return {
    stockResearches: rows.map(serializeStockResearch),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getStockResearchDetail(
  userId: string,
  id: string,
): Promise<StockResearchDetailPayload | null> {
  const row = await getStockResearchWithResourcesByIdForUser(id, userId);
  if (!row) {
    return null;
  }
  return {
    stockResearch: serializeStockResearch(row),
    resources: row.resources.map(serializeResource),
  };
}
