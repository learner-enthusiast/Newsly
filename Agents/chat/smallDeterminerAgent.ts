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
  reasoning: z.string().nullable(),
  calls: z.array(plannedToolCallModelSchema).nullable(),
});

export type SmallDeterminerModelOutput = z.infer<
  typeof smallDeterminerModelOutputSchema
>;

export type SmallDeterminerRawOutput =
  | {
      useTools: "no";
      reasoning: string | null;
    }
  | {
      useTools: "yes";
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

function normalizeDeterminerModelOutput(
  raw: SmallDeterminerModelOutput,
): SmallDeterminerRawOutput {
  if (raw.useTools === "no") {
    return { useTools: "no", reasoning: raw.reasoning };
  }

  const calls = raw.calls ?? [];
  if (calls.length === 0) {
    throw new Error('Determiner returned useTools "yes" without any calls');
  }

  return {
    useTools: "yes",
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
      reasoning?: string;
      calls?: undefined;
      model: string;
    }
  | {
      useTools: "yes";
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

function buildDeterminerSystemPrompt(tools: SerpEnginesCatalog): string {
  return [
    "You are a small determiner agent for a stock-market search product.",
    "Decide whether SerpAPI tools are needed to satisfy the user prompt.",
    'If external search or finance/news data is required, respond with useTools: "yes" and list one or more tool calls.',
    'If no Serp call is needed (greeting, meta question, or answerable without live search), respond with useTools: "no" and omit calls.',
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
  if (!params?.isNewsStory) {
    params.userPrompt = await runQueryEnhancerAgent({
      query: params.userPrompt,
    });
  }
  const raw = await generate({
    model,
    system: params.system ?? buildDeterminerSystemPrompt(tools),
    prompt: params.userPrompt,
    schemaName: "SmallDeterminerOutput",
    schemaDescription:
      'Whether to call Serp tools ("yes" | "no") and planned tool inputs when yes.',
    output: smallDeterminerModelOutputSchema,
    temperature: 0,
    maxOutputTokens: 2048,
    abortSignal: params.abortSignal,
  });

  const parsed = normalizeDeterminerModelOutput(raw);

  if (parsed.useTools === "no") {
    return {
      useTools: "no",
      reasoning: parsed.reasoning ?? undefined,
      model,
    };
  }

  return {
    useTools: "yes",
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
