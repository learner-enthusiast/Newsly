/**
 * Stock research pipeline (Inngest)
 *
 * Event: `stock/research.requested`
 * Trigger: `POST /api/stockResearch` after creating a PENDING `StockResearch` row.
 *
 * 1. load-stock-research — load row for user, mark RUNNING
 * 2. enhance-prompt — `runPromptEnhancerAgent`; enhanced brief saved to `query`
 *    (original stays in `userPrompt`)
 * 3. run-tool-determiner / save-determiner-plan — Upstox + Serp boolean flags
 * 4. execute-upstox-tools / execute-serp-tools — run enabled tools
 * 5. persist-research-resources — raw Upstox + Serp payloads → `StockResearchResource`
 * 6. select-links-to-scrape — normalize Serp links, `runLinkSelectorAgent` picks pages
 * 7. scrape-selected-links — Firecrawl; markdown saved as FIRECRAWL resources
 * 8. synthesize-report — `runReportSynthesizerAgent` → Markdown report
 * 9. mark-stock-research-completed — `reportMarkdown` + summary JSON, status COMPLETED
 *
 * onFailure marks the row FAILED with the error message.
 */

import { buildFundToolPlan } from "@/Agents/stockResearch/assetProfiles";
import {
  PROMPT_VERSION as LINK_SELECTOR_PROMPT_VERSION,
  runLinkSelectorAgent,
} from "@/Agents/stockResearch/linkSelectorAgent";
import {
  PROMPT_VERSION as PROMPT_ENHANCER_PROMPT_VERSION,
  runPromptEnhancerAgent,
} from "@/Agents/stockResearch/promptEnhancerAgent";
import {
  PROMPT_VERSION as REPORT_SYNTHESIZER_PROMPT_VERSION,
  runReportSynthesizerAgent,
} from "@/Agents/stockResearch/reportSynthesizerAgent";
import {
  PROMPT_VERSION as TOOL_DETERMINER_PROMPT_VERSION,
  normalizeStockResearchInstrument,
  runToolDeterminerAgent,
  type ToolDeterminerResult,
} from "@/Agents/stockResearch/toolDeterminerAgent";
import { createPipelineLogger } from "@/clients/pipelineLogger";
import { inngest } from "@/clients/inngestClient";
import {
  appendStockResearchLoadingLog,
  getStockResearchByIdForUser,
  markStockResearchCompleted,
  markStockResearchFailed,
  markStockResearchRunStarted,
  patchStockResearch,
} from "@/repositories/stockResearch";
import {
  listStockResearchResourcesByResearchId,
  upsertStockResearchResourceByHash,
} from "@/repositories/stockResearchResource";
import type { Prisma } from "@/db/generated/client";
import {
  executeStockResearchSerpTools,
  executeStockResearchUpstoxTools,
  type StockResearchToolExecutionResult,
} from "@/services/stockResearch/executeStockResearchTools";
import {
  compactJsonForPrompt,
  extractStockResearchSerpSummaries,
  firecrawlContentHash,
  normalizeStockResearchSerpLinks,
} from "@/services/stockResearch/researchContext";
import { scrapeUrlsWithFirecrawlRaw } from "@/services/firecrawl/scrapeUrls";
import { toJsonSafeStepOutput } from "@/services/news/normalizeArticles";
import { workflowRefSchema } from "@/lib/observability";
import { z } from "zod";

/** Recorded on each run's trace root for before/after comparisons. */
export const STOCK_RESEARCH_PROMPT_VERSIONS = {
  "stockResearch.promptEnhancer": PROMPT_ENHANCER_PROMPT_VERSION,
  "stockResearch.toolDeterminer": TOOL_DETERMINER_PROMPT_VERSION,
  "stockResearch.linkSelector": LINK_SELECTOR_PROMPT_VERSION,
  "stockResearch.reportSynthesizer": REPORT_SYNTHESIZER_PROMPT_VERSION,
};

export const STOCK_RESEARCH_PIPELINE_EVENT =
  "stock/research.requested" as const;

export const stockResearchPipelineEventDataSchema = z.object({
  userId: z.string().min(1),
  stockResearchId: z.string().min(1),
  userPrompt: z.string().min(1),
  assetType: z.enum(["STOCK", "ETF", "MUTUAL_FUND"]).default("STOCK"),
  /** Full BOD or Prisma instrument row. */
  instrument: z.record(z.string(), z.unknown()),
  /** Neatlogs run opened by the API route; each step joins it (see inngestMiddleware). */
  trace: workflowRefSchema.optional(),
});

export type StockResearchPipelineEventData = z.infer<
  typeof stockResearchPipelineEventDataSchema
>;

const PIPELINE_LOG_PREFIX = "[stock-research-pipeline]";
const pipelineLog = createPipelineLogger(PIPELINE_LOG_PREFIX);

/** Per-page cap on scraped markdown sent to the report synthesizer. */
const MAX_PAGE_CHARS_FOR_SYNTHESIS = 15_000;

function summarizeExecutions(results: StockResearchToolExecutionResult[]) {
  const ok = results.filter((row) => row.ok).length;
  const failed = results.filter((row) => !row.ok && !row.skipped).length;
  const skipped = results.filter((row) => row.skipped).length;
  return { ok, failed, skipped, total: results.length };
}

/** Execution rows without raw payloads, for the persisted report summary. */
function executionDigest(results: StockResearchToolExecutionResult[]) {
  return results.map(({ provider, tool, ok, skipped, error }) => ({
    provider,
    tool,
    ok,
    skipped,
    error: error ?? null,
  }));
}

export function enqueueStockResearchPipeline(
  data: StockResearchPipelineEventData,
) {
  return inngest.send({
    name: STOCK_RESEARCH_PIPELINE_EVENT,
    data: stockResearchPipelineEventDataSchema.parse(data),
  });
}

export const stockResearchPipelineFunction = inngest.createFunction(
  {
    id: "stock-research-pipeline",
    name: "Stock research pipeline",
    triggers: [{ event: STOCK_RESEARCH_PIPELINE_EVENT }],
    idempotency: "event.data.stockResearchId",
    timeouts: { finish: "30m" },
    onFailure: async ({ event, error, step }) => {
      const parsed = stockResearchPipelineEventDataSchema.safeParse(event.data);
      if (!parsed.success) {
        pipelineLog("onFailure", "invalid event data");
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      await step.run("mark-stock-research-failed", async () => {
        await appendStockResearchLoadingLog(
          parsed.data.stockResearchId,
          "Research failed.",
        );
        await markStockResearchFailed(parsed.data.stockResearchId, message);
      });
    },
  },
  async ({ event, step }) => {
    const input = stockResearchPipelineEventDataSchema.parse(event.data);
    const instrument = normalizeStockResearchInstrument(input.instrument);

    await step.run("load-stock-research", async () => {
      pipelineLog("load-stock-research", "start", {
        stockResearchId: input.stockResearchId,
      });
      const row = await getStockResearchByIdForUser(
        input.stockResearchId,
        input.userId,
      );
      if (!row) {
        throw new Error("Stock research not found for user");
      }
      await markStockResearchRunStarted(input.stockResearchId);
      await appendStockResearchLoadingLog(
        input.stockResearchId,
        "Pipeline started.",
      );
      return { id: row.id, status: row.status };
    });

    const enhanced = await step.run("enhance-prompt", async () => {
      pipelineLog("enhance-prompt", "start");
      await appendStockResearchLoadingLog(
        input.stockResearchId,
        "Understanding your question.",
      );
      const result = await runPromptEnhancerAgent({
        userPrompt: input.userPrompt,
        instrument,
        assetType: input.assetType,
        abortSignal: AbortSignal.timeout(120_000),
      });
      await patchStockResearch(input.stockResearchId, {
        query: result.enhancedPrompt,
      });
      pipelineLog("enhance-prompt", "done", {
        model: result.model,
        focusAreas: result.focusAreas,
      });
      return toJsonSafeStepOutput(result);
    });

    const determiner = (await step.run("run-tool-determiner", async () => {
      pipelineLog("run-tool-determiner", "start", { assetType: input.assetType });
      // ETFs / mutual funds use a fixed plan (company-fundamentals tools do not apply).
      const result =
        input.assetType === "STOCK"
          ? await runToolDeterminerAgent({
              userPrompt: enhanced.enhancedPrompt,
              instrument: input.instrument,
            })
          : buildFundToolPlan(input.assetType, instrument, enhanced.enhancedPrompt);
      return toJsonSafeStepOutput(result);
    })) as ToolDeterminerResult;

    await step.run("save-determiner-plan", async () => {
      await appendStockResearchLoadingLog(
        input.stockResearchId,
        "Selecting research tools.",
      );
      await patchStockResearch(input.stockResearchId, {
        determinerPlan: toJsonSafeStepOutput(
          determiner,
        ) as Prisma.InputJsonValue,
        instrumentKey:
          typeof determiner.instrument?.instrumentKey === "string"
            ? determiner.instrument.instrumentKey
            : undefined,
        symbol:
          typeof determiner.instrument?.tradingSymbol === "string"
            ? determiner.instrument.tradingSymbol
            : undefined,
        exchange:
          typeof determiner.instrument?.exchange === "string"
            ? determiner.instrument.exchange
            : undefined,
        isin:
          typeof determiner.instrument?.isin === "string"
            ? determiner.instrument.isin
            : undefined,
        companyName:
          typeof determiner.instrument?.name === "string"
            ? determiner.instrument.name
            : undefined,
      });
    });

    const upstoxResults = (await step.run("execute-upstox-tools", async () => {
      await appendStockResearchLoadingLog(
        input.stockResearchId,
        "Fetching Upstox market data.",
      );
      pipelineLog("execute-upstox-tools", "start");
      const results = await executeStockResearchUpstoxTools(
        determiner.upstox,
        determiner.instrument,
      );
      return toJsonSafeStepOutput(results);
    })) as StockResearchToolExecutionResult[];

    const serpResults = (await step.run("execute-serp-tools", async () => {
      await appendStockResearchLoadingLog(
        input.stockResearchId,
        "Searching web and news sources.",
      );
      pipelineLog("execute-serp-tools", "start");
      const results = await executeStockResearchSerpTools(
        determiner.serp,
        determiner.instrument,
        enhanced.enhancedPrompt,
        input.assetType,
      );
      return toJsonSafeStepOutput(results);
    })) as StockResearchToolExecutionResult[];

    const allResults = [...upstoxResults, ...serpResults];

    await step.run("persist-research-resources", async () => {
      await appendStockResearchLoadingLog(
        input.stockResearchId,
        "Saving research sources.",
      );
      pipelineLog("persist-research-resources", "start", {
        count: allResults.length,
      });
      const persistRows = allResults.filter(
        (row) => row.ok && row.rawData != null,
      );
      await Promise.all(
        persistRows.map((row) =>
          upsertStockResearchResourceByHash({
            stockResearchId: input.stockResearchId,
            provider: row.provider,
            type: row.resourceType,
            title: row.title,
            externalId: row.externalId,
            contentHash: row.contentHash,
            rawData: toJsonSafeStepOutput(
              row.rawData,
            ) as Prisma.InputJsonValue,
            metadata: {
              tool: row.tool,
              skipped: row.skipped,
              error: row.error ?? null,
            },
          }),
        ),
      );
    });

    const serpSummaries = extractStockResearchSerpSummaries(serpResults);

    const selectedLinks = await step.run("select-links-to-scrape", async () => {
      await appendStockResearchLoadingLog(
        input.stockResearchId,
        "Picking the most relevant articles.",
      );
      const links = normalizeStockResearchSerpLinks(serpResults);
      pipelineLog("select-links-to-scrape", "start", {
        candidateCount: links.length,
      });
      const selected = await runLinkSelectorAgent({
        userPrompt: input.userPrompt,
        enhancedPrompt: enhanced.enhancedPrompt,
        instrument: determiner.instrument,
        links,
        serpSummaries,
        assetType: input.assetType,
        abortSignal: AbortSignal.timeout(180_000),
      });
      pipelineLog("select-links-to-scrape", "done", {
        selectedCount: selected.length,
      });
      return toJsonSafeStepOutput(selected);
    });

    const scraped = await step.run("scrape-selected-links", async () => {
      await appendStockResearchLoadingLog(
        input.stockResearchId,
        "Reading articles.",
      );
      pipelineLog("scrape-selected-links", "start", {
        urlCount: selectedLinks.length,
      });
      const bundles = await scrapeUrlsWithFirecrawlRaw(
        selectedLinks.map((link) => link.url),
      );

      const rows = await Promise.all(
        selectedLinks.map(async (link, index) => {
          const markdown = bundles[index]?.markdown?.trim() ?? "";
          if (!markdown) {
            pipelineLog("scrape-selected-links", "skip empty scrape", {
              url: link.url,
            });
            return { url: link.url, ok: false };
          }
          await upsertStockResearchResourceByHash({
            stockResearchId: input.stockResearchId,
            provider: "FIRECRAWL",
            type: link.engine.includes("News") ? "NEWS" : "WEB_PAGE",
            title: link.title ?? link.url,
            url: link.url,
            externalId: link.engine,
            content: markdown,
            contentHash: firecrawlContentHash(link.url),
            metadata: {
              engine: link.engine,
              source: link.source ?? null,
              date: link.date ?? null,
              snippet: link.snippet ?? null,
              selectionReason: link.reason,
            },
          });
          return { url: link.url, ok: true };
        }),
      );

      const okCount = rows.filter((row) => row.ok).length;
      pipelineLog("scrape-selected-links", "done", {
        scrapedCount: okCount,
      });
      return { okCount, total: rows.length };
    });

    const report = await step.run("synthesize-report", async () => {
      await appendStockResearchLoadingLog(
        input.stockResearchId,
        "Writing your research report.",
      );

      // Scraped pages are read back from the DB so step outputs stay small.
      const resources = await listStockResearchResourcesByResearchId(
        input.stockResearchId,
      );
      const webPages = resources
        .filter((row) => row.provider === "FIRECRAWL" && row.content && row.url)
        .map((row) => {
          const meta = (row.metadata ?? {}) as Record<string, unknown>;
          return {
            url: row.url!,
            title: row.title,
            source: typeof meta.source === "string" ? meta.source : null,
            date: typeof meta.date === "string" ? meta.date : null,
            content: row.content!.slice(0, MAX_PAGE_CHARS_FOR_SYNTHESIS),
          };
        });
      const upstoxData = upstoxResults
        .filter((row) => row.ok && row.rawData != null)
        .map((row) => ({
          tool: row.tool,
          data: compactJsonForPrompt(row.rawData),
        }));
      const unavailableTools = allResults
        .filter((row) => !row.ok && !row.skipped)
        .map((row) => row.tool);

      if (
        upstoxData.length === 0 &&
        webPages.length === 0 &&
        serpSummaries.length === 0
      ) {
        throw new Error("No research data could be collected for this stock");
      }

      pipelineLog("synthesize-report", "start", {
        upstoxCount: upstoxData.length,
        webPageCount: webPages.length,
        serpSummaryCount: serpSummaries.length,
      });
      const result = await runReportSynthesizerAgent({
        userPrompt: input.userPrompt,
        enhancedPrompt: enhanced.enhancedPrompt,
        focusAreas: enhanced.focusAreas,
        instrument: determiner.instrument,
        upstoxData,
        webPages,
        serpSummaries,
        unavailableTools,
        assetType: input.assetType,
        abortSignal: AbortSignal.timeout(600_000),
      });
      pipelineLog("synthesize-report", "done", {
        model: result.model,
        markdownLength: result.markdown.length,
      });
      return result;
    });

    const summary = summarizeExecutions(allResults);

    await step.run("mark-stock-research-completed", async () => {
      await appendStockResearchLoadingLog(
        input.stockResearchId,
        "Research complete.",
      );
      await markStockResearchCompleted(input.stockResearchId, {
        report: toJsonSafeStepOutput({
          phase: "report",
          summary,
          scraped,
          enhancedPrompt: enhanced.enhancedPrompt,
          focusAreas: enhanced.focusAreas,
          determinerReasoning: determiner.reasoning ?? null,
          synthesizerModel: report.model,
          executions: executionDigest(allResults),
        }) as Prisma.InputJsonValue,
        reportMarkdown: report.markdown,
      });
      pipelineLog("mark-stock-research-completed", "done", summary);
    });

    return {
      stockResearchId: input.stockResearchId,
      summary,
      scraped,
    };
  },
);
