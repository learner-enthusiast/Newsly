/**
 * Conversation retrieval query agent
 *
 * Produces one semantic-search query from the current user message and recent
 * chat context for pgvector retrieval of older messages in the same session.
 *
 * Input: currentUserMessage; optional recentMessages (~10 turns).
 * Output: { query: string }
 */

import { aiClient, createAIClient, type AIClientOptions } from "@/clients/AIClient";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import { formatRecentMessagesForEnhancer } from "@/Agents/chat/queryEnhancerAgent";
import { z } from "zod";

const recentMessageSchema = z.object({
  role: z.string().min(1),
  content: z.string().min(1),
});

export const chatStorySimilarityQueryParamsSchema = z.object({
  currentUserMessage: z.string().min(1),
  recentMessages: z.array(recentMessageSchema).max(10).optional(),
  model: z.string().min(1).optional(),
  system: z.string().min(1).optional(),
});

export type ChatStorySimilarityQueryParams = z.input<
  typeof chatStorySimilarityQueryParamsSchema
> & {
  abortSignal?: AbortSignal;
};

export const chatStorySimilarityQueryOutputSchema = z.object({
  query: z.string().min(1).max(500),
});

export type ChatStorySimilarityQueryOutput = z.infer<
  typeof chatStorySimilarityQueryOutputSchema
>;

const modelOutputSchema = chatStorySimilarityQueryOutputSchema;

function resolveChatStorySimilarityQueryModel(override?: string): string {
  return resolveOpenAiModelId(
    override,
    process.env.CHAT_STORY_SIMILARITY_QUERY_MODEL,
  );
}

function buildSystemPrompt(): string {
  return [
    "You are a Conversation Retrieval Query Agent.",
    "",
    "Your job is to create ONE high-quality semantic-search query from the current user message and the recent conversation context.",
    "",
    "INPUT",
    "You will receive:",
    "1. currentUserMessage",
    "2. recentMessages (approximately the last 10 conversation messages; USER and ASSISTANT)",
    "",
    "Your output will NOT directly answer the user.",
    "Your only job is to produce a concise semantic-search query that can be embedded and used to retrieve historically relevant conversation messages from a pgvector database.",
    "",
    "PURPOSE",
    "The generated query will search older messages from the SAME chat session.",
    "Answer: \"What previous parts of this conversation are relevant to what the user is asking right now?\"",
    "",
    "This matters for ambiguous follow-ups such as: \"create a story about it\", \"tell me more about that\", \"go back to the Microsoft thing\", \"what about the investment?\", \"I want to research that again\", \"create a story from this\", \"what did we discuss earlier about this?\"",
    "",
    "CONTEXT RESOLUTION",
    "Use recent conversation to resolve pronouns and references (it, that, this), companies, products, people, locations, events, investments, technologies, industries, topics, research subjects, and user intentions.",
    "If the current message is explicit, preserve its important entities and topic.",
    "If ambiguous, infer the most likely referenced topic from context.",
    "",
    "Do NOT concatenate the last 10 messages. Synthesize their meaning into a focused retrieval query.",
    "",
    "BAD: \"User asked about Microsoft, then Reliance, then Myntra, then Microsoft again, create a story about it.\"",
    "GOOD: \"Microsoft AI data center expansion in Hyderabad, investment, infrastructure plans, and related developments\"",
    "",
    "RETRIEVAL PRIORITY (most important first):",
    "1. Current user intent",
    "2. Current topic/entity",
    "3. Specific companies/organizations",
    "4. Specific locations",
    "5. Specific events/projects",
    "6. Specific products/technologies",
    "7. Time context if relevant",
    "8. Important user constraints",
    "",
    "Do not include irrelevant older topics merely because they appear in recentMessages.",
    "",
    "DISTINGUISH USER INTENT FROM ASSISTANT CONTENT",
    "Prefer explicit user statements, repeated user topics, topics tied to the current request, and user-referenced entities.",
    "Assistant messages help resolve references but must not override explicit user statements.",
    "",
    "STORY CREATION",
    "If the user asks to create a story, article, post, briefing, or report, the query must identify the underlying SUBJECT—not the command.",
    "Example output for \"Create a story about it\" after Microsoft/Hyderabad discussion:",
    "\"Microsoft AI data center expansion in Hyderabad, investment, companies involved, and infrastructure plans\"",
    "",
    "OUTPUT",
    "Return strict JSON: { \"query\": \"...\" }",
    "",
    "RULES",
    "- Exactly one query.",
    "- No explanation, markdown, or multiple queries.",
    "- Query should normally be 8–30 words.",
    "- Preserve important proper nouns.",
    "- Prefer specific concepts over generic words.",
    "- Do not include \"the user asked\", chat history, embeddings, or pgvector.",
    "- Do not fabricate entities or facts.",
    "- Do not introduce a new topic.",
    "- Do not answer the user's question or generate a story.",
  ].join("\n");
}

function normalizeRetrievalQuery(raw: string, fallback: string): string {
  let text = raw.trim();

  const quoted = /^["']([\s\S]*)["']$/.exec(text);
  if (quoted?.[1]) {
    text = quoted[1].trim();
  }

  if (!text) {
    text = fallback.trim();
  }

  return chatStorySimilarityQueryOutputSchema.shape.query.parse(text);
}

async function runChatStorySimilarityQueryCore(
  params: ChatStorySimilarityQueryParams,
  generate: typeof aiClient.generate,
): Promise<ChatStorySimilarityQueryOutput> {
  const { abortSignal, ...rawParams } = params;
  const parsed = chatStorySimilarityQueryParamsSchema.parse(rawParams);
  const model = resolveChatStorySimilarityQueryModel(parsed.model);
  const recentMessages = formatRecentMessagesForEnhancer(parsed.recentMessages);
  const fallbackQuery = parsed.currentUserMessage.trim();

  const result = await generate({
    model,
    system: parsed.system ?? buildSystemPrompt(),
    prompt: fallbackQuery,
    extraContext: recentMessages
      ? { currentUserMessage: fallbackQuery, recentMessages }
      : { currentUserMessage: fallbackQuery },
    schemaName: "ConversationRetrievalQuery",
    schemaDescription:
      "Single semantic-search query string for retrieving relevant older chat messages.",
    output: modelOutputSchema,
    temperature: 0,
    maxOutputTokens: 256,
    abortSignal,
  });

  return {
    query: normalizeRetrievalQuery(result.query, fallbackQuery),
  };
}

export function createChatStorySimilarityQueryAgent(
  options: AIClientOptions = {},
) {
  const client = createAIClient(options);

  return function chatStorySimilarityQueryAgent(
    params: ChatStorySimilarityQueryParams,
  ): Promise<ChatStorySimilarityQueryOutput> {
    return runChatStorySimilarityQueryCore(
      params,
      client.generate.bind(client),
    );
  };
}

export async function runChatStorySimilarityQueryAgent(
  params: ChatStorySimilarityQueryParams,
): Promise<ChatStorySimilarityQueryOutput> {
  return runChatStorySimilarityQueryCore(
    params,
    aiClient.generate.bind(aiClient),
  );
}
