/**
 * Stock research report synthesizer — final step of the stock research pipeline.
 *
 * Turns collected Upstox market/fundamental data, Firecrawl-scraped web pages and
 * Serp summaries into one Markdown research report answering the (enhanced) user
 * prompt. Every web-derived claim links to its source URL; numbers come only from
 * the supplied data.
 *
 * Model: `STOCK_RESEARCH_SYNTHESIZER_MODEL` → default `gpt-5.4-mini`.
 */

import {
  aiClient,
  createAIClient,
  type AIClientOptions,
} from "@/clients/AIClient";
import type { StockResearchInstrument } from "@/Agents/stockResearch/toolDeterminerAgent";
import { RESEARCH_ASSET_PROFILES } from "@/Agents/stockResearch/assetProfiles";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import type { ResearchAssetType } from "@/services/stockResearch/stockResearchTypes";
import { z } from "zod";

const DEFAULT_STOCK_RESEARCH_SYNTHESIZER_MODEL = "gpt-5.4-mini";

const reportSynthesizerOutputSchema = z.object({
  markdown: z.string().min(1),
});

export type ReportSynthesizerUpstoxInput = {
  tool: string;
  /** Compacted JSON text of the tool response. */
  data: string;
};

export type ReportSynthesizerWebPageInput = {
  url: string;
  title: string | null;
  source: string | null;
  date: string | null;
  content: string;
};

export type ReportSynthesizerAgentParams = {
  userPrompt: string;
  enhancedPrompt: string;
  focusAreas: string[];
  instrument: StockResearchInstrument;
  upstoxData: ReportSynthesizerUpstoxInput[];
  webPages: ReportSynthesizerWebPageInput[];
  serpSummaries: string[];
  /** Tools that were planned but failed, so the report can note data gaps. */
  unavailableTools: string[];
  assetType?: ResearchAssetType;
  model?: string;
  abortSignal?: AbortSignal;
};

export type ReportSynthesizerResult = { markdown: string; model: string };

export function resolveReportSynthesizerModel(override?: string): string {
  return resolveOpenAiModelId(
    override,
    process.env.STOCK_RESEARCH_SYNTHESIZER_MODEL ??
      DEFAULT_STOCK_RESEARCH_SYNTHESIZER_MODEL,
  );
}

/** Bump whenever the system prompt below changes. */
export const PROMPT_VERSION = "v1";

function buildSystemPrompt(assetType: ResearchAssetType): string {
  const profile = RESEARCH_ASSET_PROFILES[assetType];
  return [
    `You are ${profile.analystRole} writing for Indian retail investors.`,
    `Write one Markdown research report on the given ${profile.noun} that answers the research brief.`,
    "",
    "Sources you may use (and nothing else):",
    "- upstoxData: market quotes, candles, news and (for stocks) fundamentals, shareholding, corporate actions, derivatives analytics, FII/DII flows (JSON, possibly truncated).",
    "- webPages: scraped article text, each with a url.",
    "- serpSummaries: search engine AI summaries — treat as leads, not facts, unless a webPage or upstoxData confirms them.",
    "",
    "Rules:",
    "- Every number must come from the supplied data. Never invent prices, ratios, returns, expense ratios, dates or targets.",
    "- Cite web-derived claims inline as Markdown links to the page url, e.g. ([Economic Times](https://...)).",
    "- When data is missing or a tool is listed in unavailableTools, say so briefly instead of guessing.",
    "- Present both positives and negatives; do not give a personalised buy/sell instruction.",
    "- Use Indian number formatting conventions (₹, lakh, crore) where natural.",
    "",
    "Structure (skip a section when there is no data for it):",
    ...profile.reportStructure,
    "",
    "End with one italic line: research summary, not investment advice.",
    "Return only the Markdown in the `markdown` field.",
  ].join("\n");
}

async function runReportSynthesizerCore(
  params: ReportSynthesizerAgentParams,
  generate: typeof aiClient.generate,
): Promise<ReportSynthesizerResult> {
  const model = resolveReportSynthesizerModel(params.model);
  const output = await generate({
    model,
    system: buildSystemPrompt(params.assetType ?? "STOCK"),
    prompt: params.enhancedPrompt,
    extraContext: {
      originalUserPrompt: params.userPrompt,
      focusAreas: params.focusAreas,
      instrument: params.instrument,
      upstoxData: params.upstoxData,
      webPages: params.webPages,
      serpSummaries: params.serpSummaries,
      unavailableTools: params.unavailableTools,
    },
    schemaName: "StockResearchReportOutput",
    schemaDescription: "Markdown research report.",
    output: reportSynthesizerOutputSchema,
    maxOutputTokens: 16_000,
    abortSignal: params.abortSignal,
  });

  return { markdown: output.markdown.trim(), model };
}

export function createReportSynthesizerAgent(options: AIClientOptions = {}) {
  const client = createAIClient(options);

  return async function reportSynthesizerAgent(
    params: ReportSynthesizerAgentParams,
  ): Promise<ReportSynthesizerResult> {
    return await runReportSynthesizerCore(params, client.generate.bind(client));
  };
}

export async function runReportSynthesizerAgent(
  params: ReportSynthesizerAgentParams,
): Promise<ReportSynthesizerResult> {
  return await runReportSynthesizerCore(params, aiClient.generate.bind(aiClient));
}
