/**
 * Article synthesizer agent (chat Serp → scrape shortlist)
 *
 * Role:
 * Adapter between chat Serp normalization and `ResearchArticleSelectorAgent` — builds link
 * rows (title, snippet, source, AI-overview follow-up flag) with chat-specific system rules.
 *
 * Called from:
 * - `inngest/chatPipeline.ts` — `run-article-synthesizer` after Serp branch
 * - `inngest/newsNewchatPipeline.ts` — `select-articles` parallel step
 * - Initial system briefing uses `ResearchArticleSelectorAgent` directly in `newsPipeline.ts`
 *
 * Model: Delegates to selector — `RESEARCH_ARTICLE_SELECTOR_MODEL`.
 *
 * Input:
 * - `userPrompt` — enhanced or raw research question
 * - `hits` — normalized Serp rows (`normalizedSerpHitSchema`)
 * - Optional `topPercent` (default 40), `maxArticles` (default 6), `abortSignal`
 *
 * Output: `SelectedResearchArticle[]` — `{ url, domain, title, sourceType }`, deduped URLs,
 * capped at `maxArticles`.
 *
 * Does not: Firecrawl scrape, clean HTML, or call `ChatModel`.
 */

import {
  runResearchArticleSelectorAgent,
  type SelectedResearchArticle,
} from "@/Agents/news/ResearchArticleSelectorAgent";
import { buildResearchPromptWithHistory } from "@/services/chat/researchPrompt";
import { normalizedSerpHitSchema } from "@/services/chat/normalizeSerpResults";
import { z } from "zod";

const AI_OVERVIEW_FOLLOW_UP_ENGINE = "google_search_ai_overview_follow_up";

const CHAT_ARTICLE_SELECTOR_SYSTEM = [
  "This is a single user research question in chat — not a daily news briefing.",
  "Select URLs whose full text is most likely to contain direct evidence for the resolved question.",
  "Prefer on-topic primary reporting, official/company/government sources, and niche coverage over generic popularity.",
  "When the question names entities, locations, or events, the page must materially address those — not tangential market chatter.",
  "Relevance to the question outweighs generic prominence; use recency when the question is time-sensitive.",
].join(" ");

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
  recentMessages?: Array<{ role: string; content: string }>;
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
    ...(hit.engine === AI_OVERVIEW_FOLLOW_UP_ENGINE
      ? {
          fromAiOverviewFollowUp: true as const,
          selectionWeight: 1.25,
        }
      : {}),
  }));

  const userPrompt = buildResearchPromptWithHistory(
    parsed.userPrompt,
    params.recentMessages,
  );

  const selected = await runResearchArticleSelectorAgent({
    userPrompt,
    links,
    topPercent: parsed.topPercent,
    model: parsed.model,
    system: CHAT_ARTICLE_SELECTOR_SYSTEM,
    abortSignal,
  });

  return selected.slice(0, parsed.maxArticles);
}
