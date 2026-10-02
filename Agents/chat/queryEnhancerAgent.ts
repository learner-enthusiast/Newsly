/**
 * Query enhancer agent (conversational query rewrite)
 *
 * Role:
 * Produce a standalone research query from the current user message by fixing grammar and
 * resolving pronouns/references **only when** recent chat context is required. Does not
 * invent dates, tickers, or entities that the user did not supply in the current turn.
 *
 * Called from:
 * - `runSmallDeterminerAgent` before Serp tool planning (skipped when `isNewsStory` deep dive)
 * - `inngest/chatPipeline.ts` indirect via determiner step
 *
 * Model: `QUERY_ENHANCER_MODEL` → `OPENAI_MODEL` → `gpt-4o-mini`.
 *
 * Input:
 * - `query` — raw user text for this turn
 * - Optional `recentMessages` — up to 10 prior turns (`formatRecentMessagesForEnhancer`)
 * - Optional `model`, `system`, `abortSignal`
 *
 * Output: Single enhanced query string (plain text, no JSON wrapper).
 *
 * Does not: choose Serp engines, scrape pages, or apply guardrails (runs after guardrails pass).
 */

import { aiClient, createAIClient, type AIClientOptions } from "@/clients/AIClient";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import { z } from "zod";

const RECENT_MESSAGE_LIMIT = 10;
const RECENT_MESSAGE_CHARS = 500;

const recentMessageSchema = z.object({
  role: z.string().min(1),
  content: z.string().min(1),
});

export const queryEnhancerParamsSchema = z.object({
  /** Raw user query before search or routing. */
  query: z.string().min(1),
  recentMessages: z.array(recentMessageSchema).max(RECENT_MESSAGE_LIMIT).optional(),
  model: z.string().min(1).optional(),
  system: z.string().min(1).optional(),
});

export type QueryEnhancerParams = z.input<typeof queryEnhancerParamsSchema> & {
  abortSignal?: AbortSignal;
};

export const enhancedQuerySchema = z.string().min(1).max(2000);

const modelOutputSchema = z.object({
  enhancedQuery: z.string().min(1).max(2000),
});

function resolveQueryEnhancerModel(override?: string): string {
  return resolveOpenAiModelId(override, process.env.QUERY_ENHANCER_MODEL);
}

/** Same trimming convention as the small determiner recent-message context. */
export function formatRecentMessagesForEnhancer(
  messages?: Array<{ role: string; content: string }>,
): Array<{ role: string; content: string }> | undefined {
  if (!messages || messages.length === 0) {
    return undefined;
  }

  return messages.slice(-RECENT_MESSAGE_LIMIT).flatMap((message) => {
    const role = message.role.trim();
    const content = message.content.trim().slice(0, RECENT_MESSAGE_CHARS);
    if (!role || !content) {
      return [];
    }
    return [{ role, content }];
  });
}

function buildSystemPrompt(): string {
  return [
    "You are a query enhancement agent for a financial and economic research product.",
    "",
    "Take the current user query and return a corrected, clearer version suitable for search/research routing.",
    "",
    "Recent messages (when provided) are context for resolving references — NOT facts to automatically inherit.",
    "The current user message is authoritative.",
    "Use previous conversation only when necessary to understand what the current message refers to.",
    "If the current message is independently understandable, treat it as a self-contained query and do not inject previous topic constraints.",
    "Never manufacture missing temporal, numerical, entity, geographic, or factual constraints from previous messages.",
    "When uncertain whether context should be inherited, prefer the conservative interpretation: preserve the current query rather than adding an unsupported constraint.",
    "",
    "Context resolution (use recent messages): incomplete follow-ups or pronouns/references such as \"what about diesel?\", \"what did they say about it?\", \"explain the second point\", \"tell me more about that\", \"what is its current debt?\" when \"its\" must be resolved.",
    "",
    "Independent query (do NOT inject prior topic constraints): the current message already names a recognizable standalone topic, e.g. \"What are India's diesel export figures?\", \"What is Reliance's current stock price?\" even if a different year or topic was discussed earlier.",
    "",
    "NEVER automatically inherit from previous messages unless the current message explicitly needs it:",
    "years, dates, months, quarters, financial years, prices, percentages, quantities, \"latest\"/\"current\" qualifiers, locations, companies, people, events, or status.",
    "",
    "Example — do NOT inherit year:",
    "Prior: India crude oil dependency in 2023. Current: What are India's diesel export figures?",
    "Output: India's diesel export figures (NOT \"in 2023\").",
    "",
    "Example — DO inherit when resolving reference:",
    "Prior: India crude oil dependency in 2026. Current: What about diesel?",
    "Output: India's diesel exports/imports in 2026.",
    "",
    "Explicit information in the current message always wins over previous context.",
    "Preserve temporal words from the current message exactly: latest, current, today, this year, last year, 2026, FY2025-26, etc.",
    "Do not replace them with dates/years from earlier turns.",
    "",
    "Tasks:",
    "- Fix grammar and spelling mistakes.",
    "- Correct obvious typos in company names and financial terminology when intent is clear.",
    "- Resolve genuine conversational references only when needed.",
    "- Preserve ambiguity when the user did not specify a constraint (do not pick a year for them).",
    "- Do not answer the question, perform research, or add new facts.",
    "- Do not unnecessarily rewrite correctly written text.",
    "",
    "Output only the enhanced query text in the enhancedQuery field.",
    "No explanations, notes, Markdown, or commentary.",
  ].join("\n");
}

function normalizeEnhancedQuery(raw: string, fallback: string): string {
  let text = raw.trim();

  const quoted = /^["']([\s\S]*)["']$/.exec(text);
  if (quoted?.[1]) {
    text = quoted[1].trim();
  }

  const fenced = /^```[\s\S]*?\n([\s\S]*?)\n```$/.exec(text);
  if (fenced?.[1]) {
    text = fenced[1].trim();
  }

  if (!text) {
    text = fallback.trim();
  }

  return enhancedQuerySchema.parse(text);
}

async function runQueryEnhancerCore(
  params: QueryEnhancerParams,
  generate: typeof aiClient.generate,
): Promise<string> {
  const { abortSignal, ...rawParams } = params;
  const parsed = queryEnhancerParamsSchema.parse(rawParams);
  const model = resolveQueryEnhancerModel(parsed.model);
  const recentMessages = formatRecentMessagesForEnhancer(parsed.recentMessages);

  const raw = await generate({
    model,
    system: parsed.system ?? buildSystemPrompt(),
    prompt: parsed.query.trim(),
    extraContext: recentMessages ? { recentMessages } : undefined,
    schemaName: "QueryEnhancerOutput",
    schemaDescription:
      "Single enhanced user query string; resolve references conservatively without inheriting unspecified facts.",
    output: modelOutputSchema,
    temperature: 0,
    maxOutputTokens: 512,
    abortSignal,
  });

  return normalizeEnhancedQuery(raw.enhancedQuery, parsed.query);
}

export function createQueryEnhancerAgent(options: AIClientOptions = {}) {
  const client = createAIClient(options);

  return function queryEnhancerAgent(
    params: QueryEnhancerParams,
  ): Promise<string> {
    return runQueryEnhancerCore(params, client.generate.bind(client));
  };
}

/** Return a grammar-corrected, clearer version of the user's query (plain text). */
export async function runQueryEnhancerAgent(
  params: QueryEnhancerParams,
): Promise<string> {
  return runQueryEnhancerCore(params, aiClient.generate.bind(aiClient));
}
