/**
 * Start one real stock research run the way POST /api/stockResearch does
 * (row → startRun → Inngest event), wait for it, and print runId + traceId.
 * Needs `pnpm dev` and `pnpm inngest:dev` running.
 *
 * Usage: pnpm trace:stock-research -- --symbol RELIANCE --prompt "..."
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { neatlogsClient } from "@/clients/neatlogsClient";
import { prisma } from "@/db";
import {
  enqueueStockResearchPipeline,
  STOCK_RESEARCH_PROMPT_VERSIONS,
} from "@/inngest/stockResearch/stockResearchPipeline";
import { runWorkflow, WORKFLOWS } from "@/lib/observability";
import { createStockResearch, getStockResearchById } from "@/repositories/stockResearch";
import { toJsonSafeStepOutput } from "@/services/news/normalizeArticles";

const { values } = parseArgs({
  options: {
    symbol: { type: "string", default: "RELIANCE" },
    exchange: { type: "string", default: "NSE" },
    prompt: {
      type: "string",
      default: "How did the latest quarterly results look, and what are the main risks?",
    },
    "timeout-min": { type: "string", default: "15" },
  },
});

async function main() {
  const user = await prisma.user.findFirst({
    where: { clerkId: { startsWith: "user_" } },
    select: { id: true, clerkId: true },
    orderBy: { createdAt: "asc" },
  });
  if (!user) throw new Error("No Clerk-backed user in the database");

  const instrument = await prisma.instrument.findFirst({
    where: { tradingSymbol: values.symbol, exchange: values.exchange },
  });
  if (!instrument) throw new Error(`Instrument ${values.exchange}:${values.symbol} not found`);

  const row = await createStockResearch({
    userId: user.id,
    companyName: instrument.name,
    symbol: instrument.tradingSymbol,
    exchange: instrument.exchange,
    isin: instrument.isin,
    instrumentKey: instrument.instrumentKey,
    userPrompt: values.prompt,
    query: values.prompt,
    assetType: "STOCK",
    status: "PENDING",
  });

  await neatlogsClient.ready();
  const trace = await runWorkflow(
    WORKFLOWS.stockResearch,
    {
      endUserId: user.clerkId,
      userId: user.id,
      source: "web",
      market: "IN",
      assetType: "STOCK",
      promptVersions: STOCK_RESEARCH_PROMPT_VERSIONS,
      input: { stockResearchId: row.id, userPrompt: values.prompt, symbol: instrument.tradingSymbol },
    },
    async (ref) => {
      await enqueueStockResearchPipeline({
        userId: user.id,
        stockResearchId: row.id,
        userPrompt: values.prompt,
        assetType: "STOCK",
        instrument: toJsonSafeStepOutput(instrument) as Record<string, unknown>,
        trace: ref,
      });
      return ref;
    },
  );
  await neatlogsClient.flush();

  const traceId = trace.carrier.traceparent?.split("-")[1] ?? null;
  console.log(JSON.stringify({ stockResearchId: row.id, runId: trace.runId, traceId }));

  const deadline = Date.now() + Number(values["timeout-min"]) * 60_000;
  while (Date.now() < deadline) {
    const current = await getStockResearchById(row.id);
    if (current?.status === "COMPLETED" || current?.status === "FAILED") {
      console.log(JSON.stringify({ status: current.status, error: current.error ?? null }));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  console.log(JSON.stringify({ status: "TIMEOUT" }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
