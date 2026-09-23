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

const plannedToolCallSchema = z.object({
  tool: serpToolNameSchema,
  input: z.record(z.string(), z.unknown()),
});

/** Raw structured output from the determiner model (before per-tool Zod validation). */
export const smallDeterminerRawOutputSchema = z.discriminatedUnion("useTools", [
  z.object({
    useTools: z.literal("no"),
    reasoning: z.string().nullable(),
  }),
  z.object({
    useTools: z.literal("yes"),
    reasoning: z.string().nullable(),
    calls: z.array(plannedToolCallSchema).min(1),
  }),
]);

export type SmallDeterminerRawOutput = z.infer<
  typeof smallDeterminerRawOutputSchema
>;

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
    "",
    "## Serp tool catalog",
    buildToolCatalog(tools),
  ].join("\n");
}

function validatePlannedCalls(
  calls: Array<{ tool: SerpToolName; input: Record<string, unknown> }>,
  tools: SerpEnginesCatalog,
): ValidatedSerpToolCall[] {
  return calls.map(({ tool, input }) => ({
    tool,
    input: tools[tool].inputSchema.parse(input),
  })) as ValidatedSerpToolCall[];
}

async function runDeterminerCore(
  params: SmallDeterminerAgentParams,
  generate: typeof aiClient.generate,
): Promise<SmallDeterminerResult> {
  const tools = params.tools ?? serpEngines;
  const model = resolveDeterminerModel(params.model);

  const raw = await generate({
    model,
    system: params.system ?? buildDeterminerSystemPrompt(tools),
    prompt: params.userPrompt,
    schemaName: "SmallDeterminerOutput",
    schemaDescription:
      'Whether to call Serp tools ("yes" | "no") and planned tool inputs when yes.',
    output: smallDeterminerRawOutputSchema,
    temperature: 0,
    maxOutputTokens: 2048,
    abortSignal: params.abortSignal,
  });

  if (raw.useTools === "no") {
    return {
      useTools: "no",
      reasoning: raw.reasoning ?? undefined,
      model,
    };
  }

  return {
    useTools: "yes",
    reasoning: raw.reasoning ?? undefined,
    calls: validatePlannedCalls(raw.calls, tools),
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
