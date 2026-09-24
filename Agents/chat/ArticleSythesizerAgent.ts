/**
 * Article synthesizer agent (chat)
 *
 * What it does: Thin wrapper for chat research — maps normalized Serp hits into
 * link rows and calls the research article selector to choose what to scrape next.
 *
 * Input: userPrompt; hits (normalized Serp list); optional topPercent (default 40),
 * maxArticles (default 6), model, abortSignal.
 *
 * Output: Array of selected articles: { url, domain, title, sourceType }, capped
 * at maxArticles.
 */

import {
  runResearchArticleSelectorAgent,
  type SelectedResearchArticle,
} from "@/Agents/news/ResearchArticleSelectorAgent";
import { normalizedSerpHitSchema } from "@/services/chat/normalizeSerpResults";
import { z } from "zod";

export const articleSynthesizerParamsSchema = z.object({
  userPrompt: z.string().min(1),
  hits: z.array(normalizedSerpHitSchema).min(1),
  topPercent: z.number().gt(0).max(100).default(40),
  maxArticles: z.number().int().min(1).max(12).default(6),
  model: z.string().min(1).optional(),
});

export type ArticleSynthesizerParams = z.input<
  typeof articleSynthesizerParamsSchema
> & {
  abortSignal?: AbortSignal;
};

export type ArticleSynthesizerResult = SelectedResearchArticle[];

/**
 * Pick the best Serp hits to scrape for chat research (Firecrawl downstream).
 */
export async function runArticleSynthesizerAgent(
  params: ArticleSynthesizerParams,
): Promise<ArticleSynthesizerResult> {
  const { abortSignal, ...rawParams } = params;
  const parsed = articleSynthesizerParamsSchema.parse(rawParams);

  const links = parsed.hits.slice(0, 24).map((hit) => ({
    url: hit.url,
    title: hit.title,
    snippet: hit.snippet,
    source: hit.source,
    sourceType: hit.engine,
  }));

  const selected = await runResearchArticleSelectorAgent({
    userPrompt: parsed.userPrompt,
    links,
    topPercent: parsed.topPercent,
    model: parsed.model,
    abortSignal,
  });

  return selected.slice(0, parsed.maxArticles);
}
