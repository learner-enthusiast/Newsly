/**
 * Quick Actions agent (chat UI)
 *
 * Input: up to the last 20 chat messages (conversation history only).
 * Output: exactly 5 concise next-step research actions as plain strings.
 *
 * Does not browse, search, or fact-check — interprets provided messages only.
 */

import { aiClient, createAIClient, type AIClientOptions } from "@/clients/AIClient";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import { z } from "zod";

export const QUICK_ACTION_MESSAGE_LIMIT = 20;
const MESSAGE_CHARS = 800;

const chatMessageSchema = z.object({
  role: z.string().min(1),
  content: z.string().min(1),
});

export const quickActionAgentParamsSchema = z.object({
  recentMessages: z.array(chatMessageSchema).max(QUICK_ACTION_MESSAGE_LIMIT),
  model: z.string().min(1).optional(),
  system: z.string().min(1).optional(),
});

export type QuickActionAgentParams = z.input<
  typeof quickActionAgentParamsSchema
> & {
  abortSignal?: AbortSignal;
};

export const QUICK_ACTION_COUNT = 5;

export const quickActionsOutputSchema = z.object({
  actions: z.array(z.string().min(1).max(120)).length(QUICK_ACTION_COUNT),
});

export type QuickActionsOutput = z.infer<typeof quickActionsOutputSchema>;

const modelOutputSchema = quickActionsOutputSchema;

const DEFAULT_ACTIONS: QuickActionsOutput["actions"] = [
  "Summarize today's top news",
  "Find the latest updates on this topic",
  "Explain the story in simple terms",
  "Show different perspectives",
  "Find the original sources",
];

function resolveQuickActionModel(override?: string): string {
  return resolveOpenAiModelId(
    override,
    process.env.QUICK_ACTION_AGENT_MODEL ?? process.env.CHAT_MODEL,
  );
}

export function formatMessagesForQuickActions(
  messages: Array<{ role: string; content: string }>,
): Array<{ role: string; content: string }> {
  return messages.slice(-QUICK_ACTION_MESSAGE_LIMIT).flatMap((message) => {
    const role = message.role.trim();
    const content = message.content.trim().slice(0, MESSAGE_CHARS);
    if (!role || !content) {
      return [];
    }
    return [{ role, content }];
  });
}

function buildSystemPrompt(): string {
  return [
    "You are the Quick Actions Agent for a news research assistant.",
    "",
    "Your ONLY input is the user's recent conversation history (at most 20 messages).",
    "",
    "Generate exactly 5 useful quick actions the user is likely to want next, based ONLY on the conversation.",
    "",
    "Core objective: understand what the user is researching and suggest the most useful next research/action operations.",
    "",
    "Examples of action types (adapt to context): summarize the topic; find latest updates; compare two developments; show a timeline; find original sources; explain in simple terms; show different perspectives; find related stories; analyze impact; compare country/company/sector; dive deeper into a specific aspect; extract key numbers; explain what to watch next.",
    "",
    "IMPORTANT: Return EXACTLY 5 items. Never 4 or 6. Even if the conversation is short, return exactly 5. Do not say there is not enough context — use the available conversation to make the best reasonable suggestions.",
    "",
    "Prioritize: (1) the user's latest message, (2) the current topic, (3) entities mentioned repeatedly, (4) unresolved questions, (5) information gaps, (6) natural next research steps.",
    "",
    "Do NOT simply repeat what the user already asked. Actions should move research forward.",
    "",
    "Action quality: avoid vague actions like \"Learn more\", \"Research more\", \"Continue\", \"Explore topic\".",
    "Make actions specific to the current conversation (3–10 words each when possible).",
    "",
    "Avoid repetition: do not return five variations of the same idea (e.g. five \"latest news\" phrasings). Provide different useful directions.",
    "",
    "You MUST NOT browse the web, call search APIs, retrieve external information, or fact-check. Only interpret the provided messages.",
    "",
    "Output ONLY valid JSON with exactly this structure and no other fields:",
    '{"actions":["Action 1","Action 2","Action 3","Action 4","Action 5"]}',
    "",
    "Rules: exactly 5 strings; concise; no numbering in strings; no markdown; no explanations; no surrounding text.",
  ].join("\n");
}

function normalizeActionLabel(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^\d+[.)]\s*/, "");
  text = text.replace(/^[-*•]\s*/, "");
  return text.trim().slice(0, 120);
}

function dedupeActions(actions: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const action of actions) {
    const normalized = normalizeActionLabel(action);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function padActions(actions: string[]): QuickActionsOutput["actions"] {
  const unique = dedupeActions(actions);
  const padded = [...unique];
  for (const fallback of DEFAULT_ACTIONS) {
    if (padded.length >= QUICK_ACTION_COUNT) {
      break;
    }
    const key = fallback.toLowerCase();
    if (!padded.some((item) => item.toLowerCase() === key)) {
      padded.push(fallback);
    }
  }
  while (padded.length < QUICK_ACTION_COUNT) {
    padded.push(`Explore another angle on this topic (${padded.length + 1})`);
  }
  return quickActionsOutputSchema.parse({
    actions: padded.slice(0, QUICK_ACTION_COUNT),
  }).actions;
}

function buildUserPrompt(
  formattedMessages: Array<{ role: string; content: string }>,
): string {
  if (formattedMessages.length === 0) {
    return [
      "There are no prior messages yet. The user is starting a general news research chat.",
      "Suggest exactly 5 broadly useful quick actions for someone beginning news research.",
    ].join(" ");
  }

  return [
    "Based on the conversation history below, return exactly 5 context-aware quick actions for what the user should do next.",
    "Conversation (oldest to newest):",
  ].join("\n");
}

async function runQuickActionAgentCore(
  params: QuickActionAgentParams,
  generate: typeof aiClient.generate,
): Promise<QuickActionsOutput> {
  const { abortSignal, ...rawParams } = params;
  const parsed = quickActionAgentParamsSchema.parse(rawParams);
  const formatted = formatMessagesForQuickActions(parsed.recentMessages ?? []);

  if (formatted.length === 0) {
    return { actions: padActions([]) };
  }

  const model = resolveQuickActionModel(parsed.model);

  const raw = await generate({
    model,
    system: parsed.system ?? buildSystemPrompt(),
    prompt: buildUserPrompt(formatted),
    extraContext: { recentMessages: formatted },
    schemaName: "QuickActionsOutput",
    schemaDescription:
      "Exactly five concise next-step research action labels for the chat UI.",
    output: modelOutputSchema,
    temperature: 0.4,
    maxOutputTokens: 512,
    abortSignal,
  });

  const normalized = raw.actions.map(normalizeActionLabel).filter(Boolean);
  return { actions: padActions(normalized) };
}

export function createQuickActionAgent(options: AIClientOptions = {}) {
  const client = createAIClient(options);

  return function quickActionAgent(
    params: QuickActionAgentParams,
  ): Promise<QuickActionsOutput> {
    return runQuickActionAgentCore(params, client.generate.bind(client));
  };
}

/** Generate exactly five quick-action labels from recent chat messages. */
export async function runQuickActionAgent(
  params: QuickActionAgentParams,
): Promise<QuickActionsOutput> {
  return runQuickActionAgentCore(params, aiClient.generate.bind(aiClient));
}
