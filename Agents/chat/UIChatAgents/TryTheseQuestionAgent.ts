/**
 * Try These Questions agent
 *
 * Suggests exactly 5 context-aware follow-up questions from recent chat history
 * only (no web search or external tools).
 *
 * Input: recentMessages (up to 20, oldest first); optional model, system, abortSignal.
 *
 * Output: { questions: [5 strings], model }
 */

import { aiClient, createAIClient, type AIClientOptions } from "@/clients/AIClient";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import { z } from "zod";

export const TRY_THESE_QUESTIONS_COUNT = 5;
const RECENT_MESSAGE_LIMIT = 20;
const RECENT_MESSAGE_CHARS = 800;

const recentMessageSchema = z.object({
  role: z.string().min(1),
  content: z.string().min(1),
});

export const tryTheseQuestionParamsSchema = z.object({
  recentMessages: z
    .array(recentMessageSchema)
    .min(1)
    .max(RECENT_MESSAGE_LIMIT),
  model: z.string().min(1).optional(),
  system: z.string().min(1).optional(),
});

export type TryTheseQuestionParams = z.input<
  typeof tryTheseQuestionParamsSchema
> & {
  abortSignal?: AbortSignal;
};

export const tryTheseQuestionsOutputSchema = z.object({
  questions: z
    .array(z.string().min(3).max(240))
    .length(TRY_THESE_QUESTIONS_COUNT),
});

export type TryTheseQuestionsOutput = z.infer<
  typeof tryTheseQuestionsOutputSchema
>;

const tryTheseQuestionsModelOutputSchema = z.object({
  questions: z
    .array(z.string().min(1).max(240))
    .length(TRY_THESE_QUESTIONS_COUNT),
});

function resolveTryTheseQuestionsModel(override?: string): string {
  return resolveOpenAiModelId(
    override,
    process.env.TRY_THESE_QUESTIONS_MODEL ??
      process.env.QUERY_ENHANCER_MODEL,
  );
}

/** Trim and cap messages for the prompt (same order as stored in chat). */
export function formatMessagesForTryTheseQuestions(
  messages: Array<{ role: string; content: string }>,
): Array<{ role: string; content: string }> {
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
    "You are the Try These Questions Agent for a news research assistant.",
    "Your ONLY input is the user's recent conversation history (at most the last 20 messages).",
    "Generate exactly 5 natural follow-up questions the user is likely to ask next, based ONLY on that conversation.",
    "",
    "Core objective: continue the user's research — deeper understanding, missing context, consequences, comparisons, perspectives, timelines, sources, related topics.",
    "Return EXACTLY 5 questions. Never 4 or 6. Even if the conversation is short, still return 5. Do not claim there is insufficient context.",
    "",
    "Context priority: (1) latest user message, (2) current topic, (3) entities mentioned, (4) unanswered angles, (5) logical follow-ups, (6) closely related topics.",
    "Questions must be specific to THIS conversation — not generic (avoid \"What is this?\", \"Tell me more.\", \"What happened?\").",
    "Do not repeat questions the user already asked and the assistant already answered; suggest the next logical step.",
    "Maintain continuity with the thread (same entities, event, geography when relevant).",
    "",
    "You MUST NOT browse the web, search, fact-check, or answer the questions. Only suggest questions.",
    "",
    "Output ONLY valid JSON: { \"questions\": [ \"...?\", ... ] } with exactly 5 strings.",
    "Each item must be a concise question (prefer 6–15 words), end with ?, no numbering, no markdown, no extra fields.",
  ].join("\n");
}

function buildUserPrompt(
  messages: Array<{ role: string; content: string }>,
): string {
  const lines = messages.map(
    (message, index) =>
      `[${index + 1}] ${message.role}:\n${message.content}`,
  );
  return [
    "Recent conversation (oldest to newest):",
    "",
    ...lines,
    "",
    `Return exactly ${TRY_THESE_QUESTIONS_COUNT} follow-up questions as JSON.`,
  ].join("\n");
}

function normalizeQuestionText(raw: string): string {
  let text = raw.trim().replace(/^[\d.)]+\s*/, "");
  text = text.replace(/^[-*]\s*/, "");
  if (!text) {
    return "What should we explore next about this topic?";
  }
  if (!text.endsWith("?")) {
    text = `${text}?`;
  }
  return text.slice(0, 240);
}

function normalizeQuestionsOutput(
  raw: z.infer<typeof tryTheseQuestionsModelOutputSchema>,
): TryTheseQuestionsOutput {
  const questions = raw.questions.map(normalizeQuestionText);
  return tryTheseQuestionsOutputSchema.parse({ questions });
}

async function runTryTheseQuestions(
  params: TryTheseQuestionParams,
  generate: typeof aiClient.generate,
): Promise<TryTheseQuestionsOutput & { model: string }> {
  const { abortSignal, ...rawParams } = params;
  const parsed = tryTheseQuestionParamsSchema.parse(rawParams);
  const messages = formatMessagesForTryTheseQuestions(parsed.recentMessages);

  if (messages.length === 0) {
    throw new Error("No usable messages in recent conversation history");
  }

  const model = resolveTryTheseQuestionsModel(parsed.model);
  const raw = await generate({
    model,
    system: parsed.system ?? buildSystemPrompt(),
    prompt: buildUserPrompt(messages),
    schemaName: "TryTheseQuestionsOutput",
    schemaDescription:
      "Exactly five context-aware follow-up questions for the news research chat.",
    output: tryTheseQuestionsModelOutputSchema,
    temperature: 0.4,
    maxOutputTokens: 1024,
    abortSignal,
  });

  const output = normalizeQuestionsOutput(raw);
  return { ...output, model };
}

export function createTryTheseQuestionAgent(options: AIClientOptions = {}) {
  const client = createAIClient(options);

  return function tryTheseQuestionAgent(
    params: TryTheseQuestionParams,
  ): Promise<TryTheseQuestionsOutput & { model: string }> {
    return runTryTheseQuestions(params, client.generate.bind(client));
  };
}

/** Generate 5 suggested follow-up questions from recent chat messages. */
export async function runTryTheseQuestionAgent(
  params: TryTheseQuestionParams,
): Promise<TryTheseQuestionsOutput & { model: string }> {
  return runTryTheseQuestions(params, aiClient.generate.bind(aiClient));
}
