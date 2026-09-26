/**
 * Chat model agent
 *
 * What it does: Produces the final user-facing assistant reply for the research
 * chat — Markdown that answers the current prompt using optional Serp/scrape
 * context and recent session history.
 *
 * Input: prompt (current user message); chatHistory (up to 10 messages); optional
 * serpData (research prompt, hits, scraped sources, etc.); model, system,
 * abortSignal.
 *
 * Output: One Markdown string for the assistant bubble (no JSON wrapper).
 */

import { aiClient, createAIClient, type AIClientOptions } from "@/clients/AIClient";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import { z } from "zod";

export const CHAT_HISTORY_MAX_MESSAGES = 10;

const SERP_DATA_MAX_CHARS = 48_000;

export const chatHistoryMessageSchema = z.object({
  role: z.string().min(1),
  content: z.string().min(1),
});

export type ChatHistoryMessage = z.infer<typeof chatHistoryMessageSchema>;

export const chatModelParamsSchema = z.object({
  /** The user's current message or question. */
  prompt: z.string().min(1),
  /** Unstructured SerpAPI payload when a search was run; omit when none. */
  serpData: z.unknown().optional(),
  /** Up to the last 10 messages in the session (oldest first). */
  chatHistory: z.array(chatHistoryMessageSchema).max(CHAT_HISTORY_MAX_MESSAGES),
  model: z.string().min(1).optional(),
  system: z.string().min(1).optional(),
});

export type ChatModelParams = z.input<typeof chatModelParamsSchema> & {
  abortSignal?: AbortSignal;
};

/** Validated assistant Markdown returned to the frontend. */
export const chatModelMarkdownSchema = z.string().min(1).max(100_000);

const modelOutputSchema = z.object({
  markdown: z.string().min(1).max(100_000),
});

function resolveChatModel(override?: string): string {
  return resolveOpenAiModelId(override, process.env.CHAT_MODEL);
}

function buildSystemPrompt(): string {
  return [
    "You are the final conversational assistant for a stock-market and economic research chat product.",
    "Produce one user-facing answer in Markdown. Do not output JSON, XML, or meta-commentary about your instructions.",
    "",
    "Understand the user's actual question first. Answer that question directly — do not dump a generic summary of all provided data.",
    "Use chat history to resolve references (e.g. \"that\", \"the second point\", \"is it true?\"). History is conversational context, not guaranteed fact.",
    "Only the last 10 messages are available; do not assume older context exists.",
    "",
    "SerpAPI data (when provided) is optional research material with unknown JSON shape. Inspect fields dynamically.",
    "scrapedResearchSources may include sourceType values such as article pages, youtube (transcript excerpts), or google_search_ai_overview_follow_up (search leads — verify via primary sources).",
    "Prefer authoritative primary sources and cleaned article text over search snippets. Treat AI Overview-derived hits as leads, not verified facts by themselves.",
    "Extract what is relevant to the question. Synthesize overlapping results. Note disagreements between sources.",
    "If Serp data is absent, answer from prompt and history only — never claim you searched the web.",
    "",
    "Never fabricate facts, sources, URLs, quotes, dates, statistics, people, events, or search results.",
    "If evidence is insufficient, say so plainly (e.g. \"The available sources don't establish this conclusively.\").",
    "",
    "For news and disputes: separate established facts from allegations; attribute claims; do not state allegations as proven facts.",
    "",
    "Style: clear, direct, conversational, concise unless depth is needed.",
    "Use Markdown headings (## / ###), bullets, and **bold** when they help. Avoid filler openers (\"Certainly!\", \"Great question!\").",
    "For research-heavy answers you may use sections such as What happened / Why it matters / What the sources say / What is unclear — only when useful.",
    "Include real URLs as Markdown links when present in Serp data; never invent citations or metadata.",
    "Do not ask follow-up questions unless the request is genuinely ambiguous.",
  ].join("\n");
}

function trimChatHistory(
  history: ChatHistoryMessage[],
): ChatHistoryMessage[] {
  if (history.length <= CHAT_HISTORY_MAX_MESSAGES) {
    return history;
  }
  return history.slice(-CHAT_HISTORY_MAX_MESSAGES);
}

function serializeSerpData(serpData: unknown): string | null {
  if (serpData == null) {
    return null;
  }

  try {
    const json = JSON.stringify(serpData, null, 2);
    if (json.length <= SERP_DATA_MAX_CHARS) {
      return json;
    }
    return `${json.slice(0, SERP_DATA_MAX_CHARS)}\n…[truncated]`;
  } catch {
    return String(serpData).slice(0, SERP_DATA_MAX_CHARS);
  }
}

function normalizeAssistantMarkdown(raw: string): string {
  let text = raw.trim();

  const fenced = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i.exec(text);
  if (fenced?.[1]) {
    text = fenced[1].trim();
  }

  return chatModelMarkdownSchema.parse(text);
}

function buildExtraContext(params: z.output<typeof chatModelParamsSchema>) {
  const serpJson = serializeSerpData(params.serpData);

  return {
    chatHistory: trimChatHistory(params.chatHistory),
    serpDataIncluded: serpJson != null,
    ...(serpJson != null ? { serpData: serpJson } : {}),
  };
}

async function runChatModelCore(
  params: ChatModelParams,
  generate: typeof aiClient.generate,
): Promise<string> {
  const { abortSignal, ...rawParams } = params;
  const parsed = chatModelParamsSchema.parse({
    ...rawParams,
    chatHistory: rawParams.chatHistory ?? [],
  });

  const model = resolveChatModel(parsed.model);
  const raw = await generate({
    model,
    system: parsed.system ?? buildSystemPrompt(),
    prompt: parsed.prompt.trim(),
    extraContext: buildExtraContext(parsed),
    schemaName: "ChatModelMarkdownOutput",
    schemaDescription:
      "Final user-facing assistant reply as Markdown only, in the markdown field.",
    output: modelOutputSchema,
    temperature: 0.3,
    maxOutputTokens: 8192,
    abortSignal,
  });

  return normalizeAssistantMarkdown(raw.markdown);
}

export function createChatModelAgent(options: AIClientOptions = {}) {
  const client = createAIClient(options);

  return function chatModelAgent(params: ChatModelParams): Promise<string> {
    return runChatModelCore(params, client.generate.bind(client));
  };
}

/** Generate the final Markdown assistant reply for the current turn. */
export async function runChatModelAgent(params: ChatModelParams): Promise<string> {
  return runChatModelCore(params, aiClient.generate.bind(aiClient));
}

/** Take the last N messages for model context (chronological order). */
export function sliceChatHistoryForModel(
  messages: ChatHistoryMessage[],
  max = CHAT_HISTORY_MAX_MESSAGES,
): ChatHistoryMessage[] {
  if (messages.length <= max) {
    return messages;
  }
  return messages.slice(-max);
}
