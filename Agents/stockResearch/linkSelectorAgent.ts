/**
 * Stock research link selector — picks which normalized Serp links are worth
 * scraping with Firecrawl for the final report.
 *
 * Input: user prompt, enhanced prompt, instrument, normalized Serp hits (url, title,
 * snippet, source, date, engine) and optional AI overview / AI mode text.
 * Output: up to `maxLinks` hits (by candidate index) with a short reason each.
 * The model refers to candidates by index so it cannot return URLs that were not
 * in the Serp results.
 *
 * Model: `STOCK_RESEARCH_LINK_SELECTOR_MODEL` → `OPENAI_MODEL` → default.
 */

import {
  aiClient,
  createAIClient,
  type AIClientOptions,
} from "@/clients/AIClient";
import type { StockResearchInstrument } from "@/Agents/stockResearch/toolDeterminerAgent";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import type { NormalizedSerpHit } from "@/services/chat/normalizeSerpResults";
import { z } from "zod";

export const DEFAULT_MAX_SCRAPE_LINKS = 8;

const linkSelectorOutputSchema = z.object({
  selected: z
    .array(
      z.object({
        index: z.number().int().min(0),
        reason: z.string().min(1).max(300),
      }),
    )
    .max(20),
});

export type SelectedResearchLink = NormalizedSerpHit & { reason: string };

export type LinkSelectorAgentParams = {
  userPrompt: string;
  enhancedPrompt: string;
  instrument: StockResearchInstrument;
  links: NormalizedSerpHit[];
  /** AI overview / AI mode text from Serp, when present. */
  serpSummaries?: string[];
  maxLinks?: number;
  model?: string;
  abortSignal?: AbortSignal;
};

export function resolveLinkSelectorModel(override?: string): string {
  return resolveOpenAiModelId(
    override,
    process.env.STOCK_RESEARCH_LINK_SELECTOR_MODEL,
  );
}

function buildSystemPrompt(maxLinks: number): string {
  return [
    "You select web pages to scrape for an investment research report on one listed instrument.",
    `Pick at most ${maxLinks} candidates whose full text will add the most to answering the research brief.`,
    "",
    "Prefer:",
    "- Pages specifically about this company/instrument (not generic market wraps or other companies).",
    "- Recent results coverage, earnings call notes, management commentary, analyst/broker views, regulatory filings, credible business press.",
    "- Distinct angles: avoid several pages repeating the same news item.",
    "",
    "Avoid:",
    "- Quote-only pages, stock-tip / buy-sell-call pages, forums, social media, video pages, login/paywall-only pages.",
    "- Pages about a different company with a similar name.",
    "",
    "Return candidates by their `index` field, with a one-line reason each. Return fewer than the maximum if few candidates are relevant.",
  ].join("\n");
}

async function runLinkSelectorCore(
  params: LinkSelectorAgentParams,
  generate: typeof aiClient.generate,
): Promise<SelectedResearchLink[]> {
  if (params.links.length === 0) {
    return [];
  }

  const maxLinks = params.maxLinks ?? DEFAULT_MAX_SCRAPE_LINKS;
  const candidates = params.links.map((link, index) => ({
    index,
    url: link.url,
    title: link.title ?? null,
    snippet: link.snippet ?? null,
    source: link.source ?? null,
    date: link.date ?? null,
    engine: link.engine,
  }));

  const output = await generate({
    model: resolveLinkSelectorModel(params.model),
    system: buildSystemPrompt(maxLinks),
    prompt: params.enhancedPrompt,
    extraContext: {
      originalUserPrompt: params.userPrompt,
      instrument: {
        name: params.instrument.name,
        tradingSymbol: params.instrument.tradingSymbol,
        exchange: params.instrument.exchange,
        instrumentType: params.instrument.instrumentType,
      },
      serpSummaries: params.serpSummaries ?? [],
      candidates,
    },
    schemaName: "StockResearchLinkSelectorOutput",
    schemaDescription: "Indexes of candidate links to scrape, with reasons.",
    output: linkSelectorOutputSchema,
    temperature: 0,
    maxOutputTokens: 2048,
    abortSignal: params.abortSignal,
  });

  const seen = new Set<number>();
  const selected: SelectedResearchLink[] = [];
  for (const row of output.selected) {
    const link = params.links[row.index];
    if (!link || seen.has(row.index)) {
      continue;
    }
    seen.add(row.index);
    selected.push({ ...link, reason: row.reason });
    if (selected.length >= maxLinks) {
      break;
    }
  }
  return selected;
}

export function createLinkSelectorAgent(options: AIClientOptions = {}) {
  const client = createAIClient(options);

  return async function linkSelectorAgent(
    params: LinkSelectorAgentParams,
  ): Promise<SelectedResearchLink[]> {
    return await runLinkSelectorCore(params, client.generate.bind(client));
  };
}

export async function runLinkSelectorAgent(
  params: LinkSelectorAgentParams,
): Promise<SelectedResearchLink[]> {
  return await runLinkSelectorCore(params, aiClient.generate.bind(aiClient));
}
