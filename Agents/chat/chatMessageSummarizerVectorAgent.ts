/**
 * Conversation memory description agent (chat turn → embedding text)
 *
 * Role:
 * Produce a semantic paraphrase of one chat message suitable for embedding in
 * `chat_message_embeddings`. Used to recall **past conversational context**, not as
 * verified market evidence in news synthesis.
 *
 * Called from:
 * - `inngest/chatMessageEmbeddingPipeline.ts` — after each saved user/agent message
 *
 * Model: `CHAT_MESSAGE_SUMMARIZER_VECTOR_MODEL` → `OPENAI_MODEL` → `gpt-4o-mini`.
 *
 * Input: `messageId`, `chatSessionId`, `role` (`user` | `assistant`), `message` body.
 * Unsupported roles skipped via `chatRoleForMemoryDescription`.
 *
 * Output: `{ description }` from structured JSON; persisted by embedding pipeline.
 *
 * Does not: replace stored message text or run Serp.
 */

import { aiClient, createAIClient, type AIClientOptions } from "@/clients/AIClient";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import { z } from "zod";

export const chatMessageSummarizerVectorParamsSchema = z.object({
  messageId: z.uuid(),
  chatSessionId: z.uuid(),
  role: z.enum(["user", "assistant"]),
  message: z.string().min(1),
  model: z.string().min(1).optional(),
  system: z.string().min(1).optional(),
});

export type ChatMessageSummarizerVectorParams = z.input<
  typeof chatMessageSummarizerVectorParamsSchema
> & {
  abortSignal?: AbortSignal;
};

const modelOutputSchema = z.object({
  description: z.string().min(1).max(4_000),
});

const MESSAGE_EXCERPT_CHARS = 24_000;

function resolveChatMessageSummarizerVectorModel(override?: string): string {
  return resolveOpenAiModelId(
    override,
    process.env.CHAT_MESSAGE_SUMMARIZER_VECTOR_MODEL,
  );
}

function buildSystemPrompt(): string {
  return [
    "You are a Conversation Memory Description Agent.",
    "",
    "Convert ONE chat message into a durable, semantic description suitable for embedding and future similarity search.",
    "The message may come from either the USER or the ASSISTANT.",
    "",
    "You may receive only a user message OR only an assistant message.",
    "Generate the description entirely from the provided message.",
    "Do not assume the other side of the conversation exists.",
    "",
    "PURPOSE",
    "The description will be embedded into pgvector.",
    "Future queries (e.g. finding a prior discussion about a company, location, or investment) will match against these descriptions.",
    "Capture semantic subject matter, not conversational form.",
    "",
    "WHAT TO EXTRACT (when present)",
    "Main topic, subtopics, entities, companies, organizations, people, locations, products, technologies, projects, events, investments, industries, financial and business concepts, factual subjects, questions being investigated, requests, decisions, requirements, constraints, comparisons, relationships between entities.",
    "Prioritize specific concepts over generic conversational language.",
    "",
    "USER (role = user)",
    "Focus on what the user is asking, researching, discussing, deciding, or requesting.",
    "Preserve research subject and intent.",
    "",
    "ASSISTANT (role = assistant)",
    "Extract substantive topics, entities, evidence subjects, explanations, findings, comparisons, and conclusions in the message.",
    "Do NOT write \"The assistant explained...\" — describe the actual subject matter.",
    "Do not fact-check; preserve claims present in the message without adding outside knowledge or corrections.",
    "",
    "CONVERSATIONAL LANGUAGE",
    "Remove greetings, thanks, apologies, filler, \"the user asked\", \"the assistant said\", \"here is...\", \"sure...\", unless they carry semantic meaning.",
    "",
    "FOLLOW-UPS AND AMBIGUITY",
    "If the message is ambiguous alone (e.g. \"How much is it?\", \"What about Hyderabad?\"), do NOT invent missing context or entities.",
    "Describe only what is actually in the message (e.g. \"Hyderabad location, geographic aspect of the discussed topic\").",
    "Never infer what \"it\" refers to without explicit terms in the message.",
    "",
    "RETRIEVAL QUALITY",
    "Use natural semantic language (roughly 20–80 words; shorter when the message is simple; longer only when the message is genuinely complex).",
    "Do not keyword-stuff or list random synonyms.",
    "Include multiple major topics when they are genuinely in the message.",
    "",
    "OUTPUT",
    "Return strict JSON with exactly one field: { \"description\": \"...\" }.",
    "No markdown, no explanation, no messageId, chatSessionId, or role in the output.",
    "Do not answer the message, generate a research query, or add URLs unless a URL is the substantive subject.",
    "Preserve important proper nouns exactly when possible.",
  ].join("\n");
}

function buildUserPrompt(
  params: z.output<typeof chatMessageSummarizerVectorParamsSchema>,
): string {
  const excerpt = params.message.trim().slice(0, MESSAGE_EXCERPT_CHARS);
  return [
    `messageId: ${params.messageId}`,
    `chatSessionId: ${params.chatSessionId}`,
    `role: ${params.role}`,
    "",
    "message:",
    excerpt,
  ].join("\n");
}

async function runChatMessageSummarizerVectorCore(
  params: ChatMessageSummarizerVectorParams,
  generate: typeof aiClient.generate,
): Promise<string> {
  const { abortSignal, ...rawParams } = params;
  const parsed = chatMessageSummarizerVectorParamsSchema.parse(rawParams);
  const model = resolveChatMessageSummarizerVectorModel(parsed.model);

  const result = await generate({
    model,
    system: parsed.system ?? buildSystemPrompt(),
    prompt: buildUserPrompt(parsed),
    schemaName: "ChatMessageMemoryDescription",
    schemaDescription:
      "Semantic retrieval description of a single chat message for vector search.",
    output: modelOutputSchema,
    temperature: 0.2,
    maxOutputTokens: 600,
    abortSignal,
  });

  return result.description.trim();
}

export function createChatMessageSummarizerVectorAgent(
  options: AIClientOptions = {},
) {
  const client = createAIClient(options);

  return function chatMessageSummarizerVectorAgent(
    params: ChatMessageSummarizerVectorParams,
  ): Promise<string> {
    return runChatMessageSummarizerVectorCore(
      params,
      client.generate.bind(client),
    );
  };
}

export async function runChatMessageSummarizerVectorAgent(
  params: ChatMessageSummarizerVectorParams,
): Promise<string> {
  return runChatMessageSummarizerVectorCore(
    params,
    aiClient.generate.bind(aiClient),
  );
}

/** Maps persisted chat roles to agent input roles. */
export function chatRoleForMemoryDescription(
  role: string,
): "user" | "assistant" | null {
  const normalized = role.trim().toLowerCase();
  if (normalized === "user") {
    return "user";
  }
  if (normalized === "assistant" || normalized === "agent") {
    return "assistant";
  }
  return null;
}
