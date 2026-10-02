/**
 * Potential story topic agent (`runPotentialStoryTopicAgent`)
 *
 * Role:
 * Read recent chat turns and propose **new** sidebar story subject labels for the session,
 * excluding topics already in `ChatSession.potentialStories`. Labels power “Create story” UX.
 *
 * Called from:
 * - `inngest/chatPotentialStoryTopicsPipeline.ts` — background after normal assistant reply
 * - Exported helpers: `dedupeNewStoryTopics`, `normalizeStoryTopicKey` for persistence layer
 *
 * Model: `POTENTIAL_STORY_TOPIC_MODEL` → `CHAT_STORY_IDENTIFIER_MODEL` →
 * `CHAT_STORY_SIMILARITY_QUERY_MODEL` → defaults. Up to `POTENTIAL_STORY_TOPIC_MAX_COUNT` (5).
 *
 * Input: `messages` (≤10 recent, includes current user turn); `existingStoryTopics` string[].
 *
 * Output: `{ newStoryTopics }` — 0–5 concise labels (max `POTENTIAL_STORY_TOPIC_LABEL_MAX_CHARS`).
 *
 * Does not: search the web, create `NewsStory` rows, or run on guardrail/story-handoff paths.
 */

import { aiClient, createAIClient, type AIClientOptions } from "@/clients/AIClient";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import { z } from "zod";

export const POTENTIAL_STORY_TOPIC_MESSAGE_LIMIT = 10;
const MESSAGE_CONTENT_MAX_CHARS = 2_000;
export const POTENTIAL_STORY_TOPIC_MAX_COUNT = 5;
export const POTENTIAL_STORY_TOPIC_LABEL_MAX_CHARS = 160;

const chatMessageSchema = z.object({
  role: z.string().min(1),
  content: z.string().min(1),
});

export const potentialStoryTopicAgentParamsSchema = z.object({
  messages: z.array(chatMessageSchema).max(POTENTIAL_STORY_TOPIC_MESSAGE_LIMIT),
  existingStoryTopics: z.array(z.string()),
  model: z.string().min(1).optional(),
  system: z.string().min(1).optional(),
});

export type PotentialStoryTopicAgentInput = z.input<
  typeof potentialStoryTopicAgentParamsSchema
>;

export type PotentialStoryTopicAgentParams = PotentialStoryTopicAgentInput & {
  abortSignal?: AbortSignal;
};

export const potentialStoryTopicAgentOutputSchema = z.object({
  newStoryTopics: z
    .array(z.string().min(1).max(POTENTIAL_STORY_TOPIC_LABEL_MAX_CHARS))
    .max(POTENTIAL_STORY_TOPIC_MAX_COUNT),
});

export type PotentialStoryTopicAgentOutput = z.infer<
  typeof potentialStoryTopicAgentOutputSchema
>;

const modelOutputSchema = z.object({
  newStoryTopics: z
    .array(z.string().min(1).max(POTENTIAL_STORY_TOPIC_LABEL_MAX_CHARS))
    .max(POTENTIAL_STORY_TOPIC_MAX_COUNT),
});

function resolvePotentialStoryTopicModel(override?: string): string {
  return resolveOpenAiModelId(
    override,
    process.env.POTENTIAL_STORY_TOPIC_MODEL ??
      process.env.CHAT_STORY_IDENTIFIER_MODEL ??
      process.env.CHAT_STORY_SIMILARITY_QUERY_MODEL,
  );
}

/** Normalize topic strings for deduplication (case- and punctuation-insensitive). */
export function normalizeStoryTopicKey(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatMessagesForPotentialStoryTopicAgent(
  messages: Array<{ role: string; content: string }>,
): Array<{ role: string; content: string }> {
  if (messages.length === 0) {
    return [];
  }

  return messages.slice(-POTENTIAL_STORY_TOPIC_MESSAGE_LIMIT).flatMap((message) => {
    const role = message.role.trim();
    const content = message.content.trim().slice(0, MESSAGE_CONTENT_MAX_CHARS);
    if (!role || !content) {
      return [];
    }
    return [{ role, content }];
  });
}

const TOPIC_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

function significantTokens(key: string): Set<string> {
  return new Set(
    key
      .split(" ")
      .filter(
        (token) => token.length > 2 && !TOPIC_STOPWORDS.has(token),
      ),
  );
}

/** True when two topics are the same subject or one is a trivial rephrase. */
export function storyTopicsOverlap(a: string, b: string): boolean {
  const keyA = normalizeStoryTopicKey(a);
  const keyB = normalizeStoryTopicKey(b);
  if (!keyA || !keyB) {
    return false;
  }
  if (keyA === keyB) {
    return true;
  }
  if (keyA.includes(keyB) || keyB.includes(keyA)) {
    return true;
  }

  const tokensA = significantTokens(keyA);
  const tokensB = significantTokens(keyB);
  if (tokensA.size === 0 || tokensB.size === 0) {
    return false;
  }

  let shared = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      shared += 1;
    }
  }
  if (shared === 0) {
    return false;
  }

  const unionSize = new Set([...tokensA, ...tokensB]).size;
  const jaccard = shared / unionSize;
  const coverage = shared / Math.min(tokensA.size, tokensB.size);
  return jaccard >= 0.55 || coverage >= 0.75;
}

export function dedupeNewStoryTopics(
  candidates: string[],
  existingStoryTopics: string[],
): string[] {
  const existing = existingStoryTopics.map((topic) => topic.trim()).filter(Boolean);
  const result: string[] = [];

  for (const raw of candidates) {
    const topic = raw.replace(/\s+/g, " ").trim();
    if (!topic || topic.length > POTENTIAL_STORY_TOPIC_LABEL_MAX_CHARS) {
      continue;
    }

    const duplicatesExisting = existing.some((item) =>
      storyTopicsOverlap(topic, item),
    );
    if (duplicatesExisting) {
      continue;
    }

    const duplicatesAccepted = result.some((item) =>
      storyTopicsOverlap(topic, item),
    );
    if (duplicatesAccepted) {
      continue;
    }

    result.push(topic);
    if (result.length >= POTENTIAL_STORY_TOPIC_MAX_COUNT) {
      break;
    }
  }

  return result;
}

function buildSystemPrompt(): string {
  return [
    "You are the Potential Story Topic Agent for a research chat product.",
    "",
    "Your ONLY job: read recent conversation messages and list NEW candidate story topics that are emerging from the discussion.",
    "",
    "You are NOT a story writer. Do NOT draft headlines, ledes, outlines, or article body text.",
    "Do NOT search the web, cite sources, or invent facts.",
    "Do NOT judge whether a topic is newsworthy, accurate, or important.",
    "",
    "INPUT",
    "1. messages — up to the last 10 chat messages (user and assistant).",
    "2. existingStoryTopics — story topic labels already detected or created for this session.",
    "",
    "OUTPUT",
    `Return strict JSON: { "newStoryTopics": string[] } with 0 to ${POTENTIAL_STORY_TOPIC_MAX_COUNT} items.`,
    "",
    "Each newStoryTopics entry must be:",
    "- A short, specific subject or angle that could become a source-backed story later (roughly 5–20 words).",
    "- Grounded in what the conversation actually discusses (entities, events, questions, tensions, developments).",
    "- Distinct from every string in existingStoryTopics and from other items you return (no near-duplicates).",
    "",
    "Include a topic only when the conversation clearly opens a NEW story-worthy thread not already covered by existingStoryTopics.",
    "If recent messages only continue an existing topic, add nothing.",
    "If the chat is greetings, logistics, or too vague for a subject, return an empty array.",
    "",
    "Prefer concrete nouns (company, place, policy, product, deal, conflict) over vague themes.",
    "Do not output meta labels like \"follow-up question\" or \"user curiosity\".",
    "Do not repeat the user's exact message; synthesize the underlying subject.",
  ].join("\n");
}

function normalizeModelTopics(raw: string[]): string[] {
  return raw
    .map((topic) => topic.replace(/\s+/g, " ").trim())
    .filter((topic) => topic.length > 0);
}

async function runPotentialStoryTopicAgentCore(
  params: PotentialStoryTopicAgentParams,
  generate: typeof aiClient.generate,
): Promise<PotentialStoryTopicAgentOutput> {
  const { abortSignal, ...rawParams } = params;
  const parsed = potentialStoryTopicAgentParamsSchema.parse(rawParams);
  const messages = formatMessagesForPotentialStoryTopicAgent(parsed.messages);
  const existingStoryTopics = parsed.existingStoryTopics
    .map((topic) => topic.trim())
    .filter(Boolean);

  if (messages.length === 0) {
    return { newStoryTopics: [] };
  }

  const model = resolvePotentialStoryTopicModel(parsed.model);
  const result = await generate({
    model,
    system: parsed.system ?? buildSystemPrompt(),
    prompt:
      "Identify new potential story topics from the recent conversation that are not already listed.",
    extraContext: {
      messages,
      existingStoryTopics,
    },
    schemaName: "PotentialStoryTopics",
    schemaDescription:
      "Zero to five new story topic labels not already in existingStoryTopics.",
    output: modelOutputSchema,
    temperature: 0.2,
    maxOutputTokens: 600,
    abortSignal,
  });

  const newStoryTopics = dedupeNewStoryTopics(
    normalizeModelTopics(result.newStoryTopics),
    existingStoryTopics,
  );

  return potentialStoryTopicAgentOutputSchema.parse({ newStoryTopics });
}

export function createPotentialStoryTopicAgent(options: AIClientOptions = {}) {
  const client = createAIClient(options);

  return function potentialStoryTopicAgent(
    params: PotentialStoryTopicAgentParams,
  ): Promise<PotentialStoryTopicAgentOutput> {
    return runPotentialStoryTopicAgentCore(
      params,
      client.generate.bind(client),
    );
  };
}

export async function runPotentialStoryTopicAgent(
  params: PotentialStoryTopicAgentParams,
): Promise<PotentialStoryTopicAgentOutput> {
  return runPotentialStoryTopicAgentCore(
    params,
    aiClient.generate.bind(aiClient),
  );
}
