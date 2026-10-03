/**
 * Small determiner agent (chat research orchestration brain)
 *
 * Role:
 * Single entry point for **chat** research planning: guardrails → optional query enhancement →
 * structured JSON plan for pgvector recall, Serp tool calls, YouTube fetches, and direct URL scrapes.
 *
 * Called from:
 * - `inngest/chatPipeline.ts` — `run-determiner` on every follow-up message
 * - `inngest/newsNewchatPipeline.ts` — first deep-dive turn (`isNewsStory` skips enhancer)
 *
 * Model: `DETERMINER_MODEL` → `OPENAI_MODEL` → `gpt-4o-mini`. Guardrails may use
 * `guardrailModel` / `GUARDRAIL_MODEL`; enhancer uses `QUERY_ENHANCER_MODEL`.
 *
 * Input:
 * - `userPrompt` — research question (may already be a long brief from `newsNewChatAgent`)
 * - `isNewsStory` — when true, skip query enhancer; widen allowed research context
 * - Optional `recentMessages`, `skipGuardrails`, tool catalog override, `abortSignal`
 *
 * Output: `{ guardrail, determiner }`
 * - `guardrail`: allow/block from `runStockResearchGuardrails`
 * - `determiner`: `useExistingResearch`, `existingResearchQuery` (for pgvector on
 *   `ResearchSource.description`), `useTools`, `reasoning`, validated Serp calls
 *   (`searchGoogle`, `searchGoogleNews`, …), optional `firecrawlUrls` (direct links)
 *
 * Does not:
 * - Execute Serp, Firecrawl, or YouTube (pipelines consume the plan)
 * - Set `shouldCreateStory` (client flag on `chat/message.research.requested` event)
 *
 * Related: `chatstorySimilarityQueryagent` can refine vector queries; story gap agent runs later
 * on the chat-story pipeline only.
 */

import {
  assertGuardrailAllowed,
  normalizeGuardrailChatHistory,
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
import {
  MAX_DETERMINER_FIRECRAWL_URLS,
  validateDeterminerFirecrawlUrls,
} from "@/services/chat/directUrlResearch";
import { normalizeSerpApiLocation } from "@/services/chat/serpApiLocation";

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

const determinerEvidenceModelSchema = z.object({
  useYoutube: z.boolean(),
  useAiOverviewFollowUp: z.boolean(),
});

export const smallDeterminerModelOutputSchema = z.object({
  useTools: z.enum(["yes", "no"]),
  useExistingResearch: z.boolean(),
  existingResearchQuery: z.string().max(400).nullable(),
  reasoning: z.string().nullable(),
  calls: z.array(plannedToolCallModelSchema).nullable(),
  /** Full http(s) URLs to scrape with Firecrawl when the user supplied direct links. */
  firecrawlUrls: z.array(z.string()).max(5).nullable(),
  /** Optional supporting-evidence toggles (default off). */
  evidence: determinerEvidenceModelSchema.nullable(),
});

export type DeterminerEvidenceFlags = {
  useYoutube: boolean;
  useAiOverviewFollowUp: boolean;
};

export function normalizeDeterminerEvidence(
  raw: z.infer<typeof determinerEvidenceModelSchema> | null | undefined,
): DeterminerEvidenceFlags {
  return {
    useYoutube: raw?.useYoutube === true,
    useAiOverviewFollowUp: raw?.useAiOverviewFollowUp === true,
  };
}

export type SmallDeterminerModelOutput = z.infer<
  typeof smallDeterminerModelOutputSchema
>;

export type SmallDeterminerRawOutput =
  | {
      useTools: "no";
      useExistingResearch: boolean;
      existingResearchQuery: string | null;
      reasoning: string | null;
      firecrawlUrls: string[];
    }
  | {
      useTools: "yes";
      useExistingResearch: boolean;
      existingResearchQuery: string | null;
      reasoning: string | null;
      firecrawlUrls: string[];
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

  if (tool === "searchGoogleNews") {
    const q = typeof next.q === "string" ? next.q.trim() : "";
    if (q.length > 0) {
      delete next.so;
    }
  }

  if (typeof next.q === "string") {
    next.q = next.q.trim();
  }

  if (typeof next.location === "string" && next.location.trim()) {
    next.location = normalizeSerpApiLocation(next.location);
  }

  return next;
}

function normalizeExistingResearch(
  isNewsStory: boolean,
  researchSourceCount: number,
  raw: SmallDeterminerModelOutput,
): { useExistingResearch: boolean; existingResearchQuery: string | null } {
  if (isNewsStory || researchSourceCount === 0 || !raw.useExistingResearch) {
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
  research: {
    useExistingResearch: boolean;
    existingResearchQuery: string | null;
  },
  firecrawlUrls: string[],
): SmallDeterminerRawOutput {
  if (raw.useTools === "no") {
    return {
      useTools: "no",
      useExistingResearch: research.useExistingResearch,
      existingResearchQuery: research.existingResearchQuery,
      reasoning: raw.reasoning,
      firecrawlUrls,
    };
  }

  const calls = raw.calls ?? [];
  if (calls.length === 0 && firecrawlUrls.length === 0) {
    throw new Error(
      'Determiner returned useTools "yes" without Serp calls or firecrawlUrls',
    );
  }

  return {
    useTools: "yes",
    useExistingResearch: research.useExistingResearch,
    existingResearchQuery: research.existingResearchQuery,
    reasoning: raw.reasoning,
    firecrawlUrls,
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
      firecrawlUrls: string[];
      evidence: DeterminerEvidenceFlags;
      reasoning?: string;
      calls?: undefined;
      model: string;
    }
  | {
      useTools: "yes";
      useExistingResearch: boolean;
      existingResearchQuery: string | null;
      firecrawlUrls: string[];
      evidence: DeterminerEvidenceFlags;
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
  /** Query-enhanced research intent (same string used for Serp planning). */
  researchPrompt: string;
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
          'Set useExistingResearch true only when information already stored for this chat session would help answer the current question: follow-ups, clarifications, prior sources, or references such as "this", "they", "the second point", or "what you mentioned earlier".',
          'Do not set it true merely because the session has research. Set it false when stored research would not help, such as "what happened today" with no prior topic, a greeting, or a new subject.',
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
    "## Firecrawl direct URL tool",
    `When the user supplies one or more full http(s) article URLs to read, summarize, or analyze, list them in firecrawlUrls (max ${MAX_DETERMINER_FIRECRAWL_URLS}).`,
    "The pipeline scrapes those URLs with Firecrawl and adds them as research sources.",
    'Use firecrawlUrls when the user pastes a link, says "read this URL", or clearly points at specific pages—not for bare keywords or search queries.',
    "Only include valid absolute URLs (https://...). Do not include Serp query strings or domain-only strings without a path unless the user clearly meant that homepage.",
    "When the question can be answered by scraping the given link(s) alone, set useTools to no, firecrawlUrls to those URLs, and calls to null.",
    "You may combine firecrawlUrls with Serp calls when the user links one article and also asks for broader market news.",
    "When no direct URLs are provided, set firecrawlUrls to null.",
    "",
    "## Optional supporting evidence (evidence object, or null)",
    "Default both flags to false for simple factual questions (ownership, definitions, well-known metrics).",
    "evidence.useYoutube — true only when interviews, speeches, earnings commentary, expert explainers, or long-form video may help answer the question. False for simple lookups.",
    "evidence.useAiOverviewFollowUp — true only when a Google web search (searchGoogle) is planned AND AI Overview may surface entities/claims worth verifying with 2–3 tight follow-up searches. Requires searchGoogle in calls when true. False when searchGoogle is not used or the question is trivial.",
    "Do not enable both flags unless each independently helps. Never enable for greetings or meta questions.",
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

/** Builds validated determiner output from structured model JSON (used in tests). */
export function buildSmallDeterminerResultFromModelOutput(
  raw: SmallDeterminerModelOutput,
  options: {
    tools?: SerpEnginesCatalog;
    isNewsStory?: boolean;
    researchSourceCount?: number;
    model?: string;
  } = {},
): SmallDeterminerResult {
  const tools = options.tools ?? serpEngines;
  const isNewsStory = options.isNewsStory === true;
  const researchSourceCount = Math.max(0, options.researchSourceCount ?? 0);
  const model = options.model ?? "test-model";

  const parsed = normalizeDeterminerModelOutput(
    raw,
    normalizeExistingResearch(isNewsStory, researchSourceCount, raw),
    validateDeterminerFirecrawlUrls(raw.firecrawlUrls),
  );
  const evidence = normalizeDeterminerEvidence(raw.evidence);

  if (parsed.useTools === "no") {
    return {
      useTools: "no",
      useExistingResearch: parsed.useExistingResearch,
      existingResearchQuery: parsed.existingResearchQuery,
      firecrawlUrls: parsed.firecrawlUrls,
      evidence,
      reasoning: parsed.reasoning ?? undefined,
      model,
    };
  }

  const serpCalls =
    parsed.calls.length > 0 ? validatePlannedCalls(parsed.calls, tools) : [];

  return {
    useTools: "yes",
    useExistingResearch: parsed.useExistingResearch,
    existingResearchQuery: parsed.existingResearchQuery,
    firecrawlUrls: parsed.firecrawlUrls,
    evidence,
    reasoning: parsed.reasoning ?? undefined,
    calls: serpCalls,
    model,
  };
}

type DeterminerCoreResult = {
  determiner: SmallDeterminerResult;
  researchPrompt: string;
};

async function runDeterminerCore(
  params: SmallDeterminerAgentParams,
  generate: typeof aiClient.generate,
): Promise<DeterminerCoreResult> {
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
      'useTools ("yes" | "no"), useExistingResearch, existingResearchQuery, firecrawlUrls or null, evidence { useYoutube, useAiOverviewFollowUp } or null, reasoning, and planned Serp calls when useTools is yes.',
    output: smallDeterminerModelOutputSchema,
    temperature: 0,
    maxOutputTokens: 2048,
    abortSignal: params.abortSignal,
  });

  return {
    determiner: buildSmallDeterminerResultFromModelOutput(raw, {
      tools,
      isNewsStory,
      researchSourceCount,
      model,
    }),
    researchPrompt: params.userPrompt,
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

  const chatHistory = normalizeGuardrailChatHistory(params.recentMessages);
  const guardrail = await runStockResearchGuardrails({
    userPrompt: params.userPrompt,
    chatHistory: chatHistory.length > 0 ? chatHistory : undefined,
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
    const core = await runDeterminerCore(params, client.generate.bind(client));
    return {
      guardrail,
      determiner: core.determiner,
      researchPrompt: core.researchPrompt,
    };
  };
}

/** Run with the shared app `aiClient`. Guardrails run first; throws `GuardrailBlockedError` when blocked. */
export async function runSmallDeterminerAgent(
  params: SmallDeterminerAgentParams,
): Promise<SmallDeterminerRunResult> {
  const guardrail = await applyGuardrails(params);
  const core = await runDeterminerCore(
    params,
    aiClient.generate.bind(aiClient),
  );
  return {
    guardrail,
    determiner: core.determiner,
    researchPrompt: core.researchPrompt,
  };
}
