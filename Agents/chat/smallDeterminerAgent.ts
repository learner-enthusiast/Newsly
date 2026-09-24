/**
 * Small determiner agent
 *
 * What it does: Runs stock-research guardrails first, optionally improves the user
 * prompt via the query enhancer (except on news-story deep dives), then decides
 * whether live Serp searches are needed and plans validated Google/Serp tool calls.
 *
 * Input: userPrompt; optional isNewsStory, recentMessages, model, tools catalog,
 * skipGuardrails, guardrailModel, system, abortSignal.
 *
 * Output: { guardrail, determiner } — guardrail is allow/block with category and
 * reason; determiner includes useExistingResearch, existingResearchQuery (a
 * semantic query for ResearchSource.description, or null), useTools, reasoning,
 * and optional validated Serp calls. Throws GuardrailBlockedError when the
 * prompt is not allowed.
 */

import {
  assertGuardrailAllowed,
  runStockResearchGuardrails,
  type GuardrailCheckResult,
} from "@/Agents/chat/guardrails";
import {
  aiClient,
  createAIClient,
  type AIClientOptions,
} from "@/clients/AIClient";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import { serpEngines } from "@/SERP/index";
import { z } from "zod";
import { runQueryEnhancerAgent } from "./queryEnhancerAgent";

const SERP_TOOL_NAMES = [
  "searchGoogle",
  "searchGoogleFinance",
  "searchGoogleNews",
  "searchGoogleNewsTab",
  "searchGoogleAiMode",
] as const;

export const serpToolNameSchema = z.enum(SERP_TOOL_NAMES);

export type SerpToolName = z.infer<typeof serpToolNameSchema>;

export type SerpEnginesCatalog = typeof serpEngines;

/** OpenAI structured output: flat object only (no discriminatedUnion / z.unknown). */
const serpToolInputModelSchema = z.object({
  q: z.string().nullable(),
  num: z.number().int().nullable(),
  gl: z.string().nullable(),
  hl: z.string().nullable(),
  location: z.string().nullable(),
  google_domain: z.string().nullable(),
  device: z.enum(["desktop", "tablet", "mobile"]).nullable(),
  topic_token: z.string().nullable(),
  publication_token: z.string().nullable(),
  section_token: z.string().nullable(),
  story_token: z.string().nullable(),
  kgmid: z.string().nullable(),
  no_cache: z.boolean().nullable(),
});

const plannedToolCallModelSchema = z.object({
  tool: serpToolNameSchema,
  input: serpToolInputModelSchema,
});

export const smallDeterminerModelOutputSchema = z.object({
  useTools: z.enum(["yes", "no"]),
  useExistingResearch: z.boolean(),
  existingResearchQuery: z.string().max(400).nullable(),
  reasoning: z.string().nullable(),
  calls: z.array(plannedToolCallModelSchema).nullable(),
});

export type SmallDeterminerModelOutput = z.infer<
  typeof smallDeterminerModelOutputSchema
>;

export type SmallDeterminerRawOutput =
  | {
      useTools: "no";
      useExistingResearch: boolean;
      existingResearchQuery: string | null;
      reasoning: string | null;
    }
  | {
      useTools: "yes";
      useExistingResearch: boolean;
      existingResearchQuery: string | null;
      reasoning: string | null;
      calls: Array<{ tool: SerpToolName; input: Record<string, unknown> }>;
    };

const DETERMINER_SERP_INPUT_KEYS = new Set([
  "q",
  "num",
  "gl",
  "hl",
  "location",
  "google_domain",
  "device",
  "topic_token",
  "publication_token",
  "section_token",
  "story_token",
  "kgmid",
  "no_cache",
]);

function stripNullInputFields(
  input: z.infer<typeof serpToolInputModelSchema>,
): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value != null && DETERMINER_SERP_INPUT_KEYS.has(key)) {
      record[key] = value;
    }
  }
  if (typeof record.q === "string") {
    record.q = record.q.trim();
  }
  return record;
}

/** Serp engines set `tbm` internally; model-generated values are often invalid. */
export function sanitizeSerpToolInput(
  tool: SerpToolName,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...input };
  delete next.tbm;

  if (tool === "searchGoogleNewsTab") {
    delete next.tbm;
  }

  if (typeof next.q === "string") {
    next.q = next.q.trim();
  }

  return next;
}

function normalizeExistingResearch(
  isNewsStory: boolean,
  researchSourceCount: number,
  raw: SmallDeterminerModelOutput,
): { useExistingResearch: boolean; existingResearchQuery: string | null } {
  if (
    isNewsStory ||
    researchSourceCount === 0 ||
    !raw.useExistingResearch
  ) {
    return { useExistingResearch: false, existingResearchQuery: null };
  }

  const query = raw.existingResearchQuery?.trim() ?? "";
  if (!query) {
    return { useExistingResearch: false, existingResearchQuery: null };
  }

  return { useExistingResearch: true, existingResearchQuery: query };
}

function normalizeDeterminerModelOutput(
  raw: SmallDeterminerModelOutput,
  research: { useExistingResearch: boolean; existingResearchQuery: string | null },
): SmallDeterminerRawOutput {
  if (raw.useTools === "no") {
    return {
      useTools: "no",
      useExistingResearch: research.useExistingResearch,
      existingResearchQuery: research.existingResearchQuery,
      reasoning: raw.reasoning,
    };
  }

  const calls = raw.calls ?? [];
  if (calls.length === 0) {
    throw new Error('Determiner returned useTools "yes" without any calls');
  }

  return {
    useTools: "yes",
    useExistingResearch: research.useExistingResearch,
    existingResearchQuery: research.existingResearchQuery,
    reasoning: raw.reasoning,
    calls: calls.map((call) => ({
      tool: call.tool,
      input: stripNullInputFields(call.input),
    })),
  };
}

export type ValidatedSerpToolCall = {
  [K in SerpToolName]: {
    tool: K;
    input: z.output<SerpEnginesCatalog[K]["inputSchema"]>;
  };
}[SerpToolName];

export type SmallDeterminerResult =
  | {
      useTools: "no";
      useExistingResearch: boolean;
      existingResearchQuery: string | null;
      reasoning?: string;
      calls?: undefined;
      model: string;
    }
  | {
      useTools: "yes";
      useExistingResearch: boolean;
      existingResearchQuery: string | null;
      reasoning?: string;
      calls: ValidatedSerpToolCall[];
      model: string;
    };

export type SmallDeterminerAgentParams = {
  /** End-user question or task to route to Serp tools. */
  userPrompt: string;
  /** Overrides `DETERMINER_MODEL` / `OPENAI_MODEL` / default. */
  model?: string;
  /** Tool catalog (defaults to `serpEngines` from `@/SERP`). */
  tools?: SerpEnginesCatalog;
  system?: string;
  abortSignal?: AbortSignal;
  /** When true, skip stock-research guardrails (tests only). */
  skipGuardrails?: boolean;
  guardrailModel?: string;
  isNewsStory?: boolean;
  /**
   * Indexed research descriptions in this chat (pgvector rows). When 0,
   * existing-research retrieval is disabled; Serp may still run.
   */
  researchSourceCount?: number;
  /**
   * Recent session turns, oldest first. Used only to resolve references
   * ("this", "they", "the second point"). Not a research-source payload.
   */
  recentMessages?: Array<{ role: string; content: string }>;
};

export type SmallDeterminerRunResult = {
  guardrail: GuardrailCheckResult;
  determiner: SmallDeterminerResult;
};

export function resolveDeterminerModel(override?: string): string {
  return resolveOpenAiModelId(override, process.env.DETERMINER_MODEL);
}

function buildToolCatalog(tools: SerpEnginesCatalog): string {
  return SERP_TOOL_NAMES.map((name) => {
    const entry = tools[name];
    return [
      `### ${name}`,
      entry.description,
      `Allowed tool id for calls: "${name}".`,
    ].join("\n");
  }).join("\n\n");
}

function buildDeterminerSystemPrompt(
  tools: SerpEnginesCatalog,
  isNewsStory: boolean,
  researchSourceCount: number,
): string {
  const existingResearchSection = isNewsStory
    ? [
        "This turn is a news-story deep dive. Always set useExistingResearch to false and existingResearchQuery to null.",
      ]
    : researchSourceCount === 0
      ? [
          "This chat session has no indexed research yet (researchSourceCount is 0). Always set useExistingResearch to false and existingResearchQuery to null.",
          "Fresh SerpAPI tools may still be required when useTools is yes.",
        ]
      : [
        `This chat session has ${researchSourceCount} indexed research description(s) available for vector retrieval.`,
        "Also set useExistingResearch and existingResearchQuery. These are independent of useTools.",
        "useExistingResearch does not disable fresh web search. Both may be true when stored research supplies background and SerpAPI is still needed for freshness.",
        "Set useExistingResearch true only when information already stored for this chat session would help answer the current question: follow-ups, clarifications, prior sources, or references such as \"this\", \"they\", \"the second point\", or \"what you mentioned earlier\".",
        "Do not set it true merely because the session has research. Set it false when stored research would not help, such as \"what happened today\" with no prior topic, a greeting, or a new subject.",
        "When useExistingResearch is true, existingResearchQuery is one concise semantic-search phrase for matching ResearchSource.description.",
        "Describe the underlying information to retrieve. Preserve entities, companies, people, events, and relationships. Resolve obvious references from the recent conversation. Do not copy conversational wording, invent facts, or answer the question.",
        "When useExistingResearch is false, existingResearchQuery must be null.",
        "You do not search the vector database. The caller embeds existingResearchQuery and runs pgvector similarity search on ResearchSource.description for this chat session.",
      ];

  return [
    "You are a small determiner agent for a stock-market search product.",
    "Decide whether SerpAPI tools are needed to satisfy the user prompt.",
    'If external search or finance/news data is required, respond with useTools: "yes" and list one or more tool calls.',
    'If no Serp call is needed (greeting, meta question, or answerable without live search), respond with useTools: "no" and omit calls.',
    ...existingResearchSection,
    "When useTools is yes:",
    "- Use only tool ids from the catalog below.",
    "- Each call must include `input` object fields that match that tool's input rules in its description.",
    "- Prefer the smallest set of tools (often one). Use googleFinance for tickers/quotes, googleNews or googleNewsTab for headlines, searchGoogle for general web.",
    "- Do not combine google_news `q` with token parameters; kgmid must be alone on googleNews.",
    "- Do not set `tbm`. For web news results use searchGoogleNewsTab (not searchGoogle with tbm).",
    "",
    "## Serp tool catalog",
    buildToolCatalog(tools),
  ].join("\n");
}

const RECENT_MESSAGE_LIMIT = 10;
const RECENT_MESSAGE_CHARS = 500;

function recentMessagesForPrompt(
  messages: SmallDeterminerAgentParams["recentMessages"],
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

function validatePlannedCalls(
  calls: Array<{ tool: SerpToolName; input: Record<string, unknown> }>,
  tools: SerpEnginesCatalog,
): ValidatedSerpToolCall[] {
  return calls.map(({ tool, input }) => {
    const sanitized = sanitizeSerpToolInput(tool, input);
    return {
      tool,
      input: tools[tool].inputSchema.parse(sanitized),
    };
  }) as ValidatedSerpToolCall[];
}

async function runDeterminerCore(
  params: SmallDeterminerAgentParams,
  generate: typeof aiClient.generate,
): Promise<SmallDeterminerResult> {
  const tools = params.tools ?? serpEngines;
  const model = resolveDeterminerModel(params.model);
  const isNewsStory = params.isNewsStory === true;
  const recentMessages = recentMessagesForPrompt(params.recentMessages);
  if (!isNewsStory) {
    params.userPrompt = await runQueryEnhancerAgent({
      query: params.userPrompt,
      recentMessages,
      abortSignal: params.abortSignal,
    });
  }
  const researchSourceCount = Math.max(0, params.researchSourceCount ?? 0);
  const extraContext: Record<string, unknown> = {
    researchSourceCount,
  };
  if (recentMessages) {
    extraContext.recentMessages = recentMessages;
  }
  const raw = await generate({
    model,
    system:
      params.system ??
      buildDeterminerSystemPrompt(tools, isNewsStory, researchSourceCount),
    prompt: params.userPrompt,
    extraContext,
    schemaName: "SmallDeterminerOutput",
    schemaDescription:
      'useTools ("yes" | "no"), useExistingResearch, existingResearchQuery for ResearchSource.description or null, reasoning, and planned Serp calls when useTools is yes.',
    output: smallDeterminerModelOutputSchema,
    temperature: 0,
    maxOutputTokens: 2048,
    abortSignal: params.abortSignal,
  });

  const parsed = normalizeDeterminerModelOutput(
    raw,
    normalizeExistingResearch(isNewsStory, researchSourceCount, raw),
  );

  if (parsed.useTools === "no") {
    return {
      useTools: "no",
      useExistingResearch: parsed.useExistingResearch,
      existingResearchQuery: parsed.existingResearchQuery,
      reasoning: parsed.reasoning ?? undefined,
      model,
    };
  }

  return {
    useTools: "yes",
    useExistingResearch: parsed.useExistingResearch,
    existingResearchQuery: parsed.existingResearchQuery,
    reasoning: parsed.reasoning ?? undefined,
    calls: validatePlannedCalls(parsed.calls, tools),
    model,
  };
}

async function applyGuardrails(
  params: SmallDeterminerAgentParams,
): Promise<GuardrailCheckResult> {
  if (params.skipGuardrails) {
    return {
      allowed: true,
      category: "market_news",
      reason: "Guardrails skipped by caller.",
      source: "rules",
    };
  }

  const guardrail = await runStockResearchGuardrails({
    userPrompt: params.userPrompt,
    model: params.guardrailModel,
    abortSignal: params.abortSignal,
  });
  assertGuardrailAllowed(guardrail);
  return guardrail;
}

export function createSmallDeterminerAgent(options: AIClientOptions = {}) {
  const client = createAIClient(options);

  return async function smallDeterminerAgent(
    params: SmallDeterminerAgentParams,
  ): Promise<SmallDeterminerRunResult> {
    const guardrail = await applyGuardrails(params);
    const determiner = await runDeterminerCore(
      params,
      client.generate.bind(client),
    );
    return { guardrail, determiner };
  };
}

/** Run with the shared app `aiClient`. Guardrails run first; throws `GuardrailBlockedError` when blocked. */
export async function runSmallDeterminerAgent(
  params: SmallDeterminerAgentParams,
): Promise<SmallDeterminerRunResult> {
  const guardrail = await applyGuardrails(params);
  const determiner = await runDeterminerCore(
    params,
    aiClient.generate.bind(aiClient),
  );
  return { guardrail, determiner };
}
