/**
 * Chat session title agent — short sidebar label from the first user message.
 */

import { aiClient, createAIClient, type AIClientOptions } from "@/clients/AIClient";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import {
  CHAT_SESSION_TITLE_MAX_LENGTH,
  chatTitleFromFirstUserMessage,
} from "@/services/chat/chatSessionTitle";
import { z } from "zod";

export const chatSessionTitleAgentParamsSchema = z.object({
  message: z.string().min(1),
  model: z.string().min(1).optional(),
  system: z.string().min(1).optional(),
});

export type ChatSessionTitleAgentParams = z.input<
  typeof chatSessionTitleAgentParamsSchema
> & {
  abortSignal?: AbortSignal;
};

const modelOutputSchema = z.object({
  title: z.string().min(1).max(CHAT_SESSION_TITLE_MAX_LENGTH),
});

const MESSAGE_EXCERPT_CHARS = 8_000;

function resolveChatSessionTitleModel(override?: string): string {
  return resolveOpenAiModelId(
    override,
    process.env.CHAT_SESSION_TITLE_MODEL ??
      process.env.CHAT_MESSAGE_SUMMARIZER_VECTOR_MODEL,
  );
}

function buildSystemPrompt(): string {
  return [
    "You are a Chat Session Title Agent.",
    "",
    "Given the user's FIRST message in a new research chat, produce a short, specific title for the chat sidebar.",
    "",
    "RULES",
    `- Maximum ${CHAT_SESSION_TITLE_MAX_LENGTH} characters (hard limit).`,
    "- Plain text only: no quotes, markdown, emojis, or trailing punctuation.",
    "- Capture the main topic or intent (company, place, event, question theme).",
    "- Prefer concise noun phrases over full sentences.",
    "- Do not start with \"Chat about\" or \"Discussion on\".",
    "- If the message is vague, use the clearest subject mentioned.",
    "",
    "OUTPUT",
    'Return strict JSON: { "title": "..." }',
  ].join("\n");
}

function normalizeTitle(raw: string): string {
  const singleLine = raw.replace(/\s+/g, " ").trim();
  if (!singleLine) {
    return "New chat";
  }
  if (singleLine.length <= CHAT_SESSION_TITLE_MAX_LENGTH) {
    return singleLine;
  }
  return `${singleLine.slice(0, CHAT_SESSION_TITLE_MAX_LENGTH - 1).trimEnd()}…`;
}

async function runChatSessionTitleAgentCore(
  params: ChatSessionTitleAgentParams,
  generate: typeof aiClient.generate,
): Promise<string> {
  const { abortSignal, ...rawParams } = params;
  const parsed = chatSessionTitleAgentParamsSchema.parse(rawParams);
  const excerpt = parsed.message.trim().slice(0, MESSAGE_EXCERPT_CHARS);

  if (!excerpt) {
    return chatTitleFromFirstUserMessage(parsed.message);
  }

  try {
    const model = resolveChatSessionTitleModel(parsed.model);
    const result = await generate({
      model,
      system: parsed.system ?? buildSystemPrompt(),
      prompt: `First user message:\n\n${excerpt}`,
      schemaName: "ChatSessionTitle",
      schemaDescription: "Short chat sidebar title.",
      output: modelOutputSchema,
      temperature: 0.3,
      maxOutputTokens: 120,
      abortSignal,
    });
    return normalizeTitle(result.title);
  } catch {
    return chatTitleFromFirstUserMessage(parsed.message);
  }
}

export function createChatSessionTitleAgent(options: AIClientOptions = {}) {
  const client = createAIClient(options);
  return function chatSessionTitleAgent(
    params: ChatSessionTitleAgentParams,
  ): Promise<string> {
    return runChatSessionTitleAgentCore(params, client.generate.bind(client));
  };
}

export async function runChatSessionTitleAgent(
  params: ChatSessionTitleAgentParams,
): Promise<string> {
  return runChatSessionTitleAgentCore(
    params,
    aiClient.generate.bind(aiClient),
  );
}
