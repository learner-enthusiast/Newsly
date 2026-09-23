import { aiClient, createAIClient, type AIClientOptions } from "@/clients/AIClient";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import { z } from "zod";

export const queryEnhancerParamsSchema = z.object({
  /** Raw user query before search or routing. */
  query: z.string().min(1),
  model: z.string().min(1).optional(),
  system: z.string().min(1).optional(),
});

export type QueryEnhancerParams = z.input<typeof queryEnhancerParamsSchema> & {
  abortSignal?: AbortSignal;
};

export const enhancedQuerySchema = z.string().min(1).max(2000);

const modelOutputSchema = z.object({
  enhancedQuery: z.string().min(1).max(2000),
});

function resolveQueryEnhancerModel(override?: string): string {
  return resolveOpenAiModelId(override, process.env.QUERY_ENHANCER_MODEL);
}

function buildSystemPrompt(): string {
  return [
    "You are a query enhancement agent for a stock-market and financial research product.",
    "",
    "Take a raw user query and return a corrected, clearer version of the same query.",
    "",
    "Tasks:",
    "- Fix grammar and spelling mistakes.",
    "- Correct obvious typos.",
    "- Understand incorrectly spelled stock-market terms, company names, financial terms, and market terminology.",
    "- If the user uses an incorrect financial term but the intended meaning is clear, replace it with the appropriate term.",
    "- Preserve the user's original intent. Do not answer the question or add new information.",
    "- Do not unnecessarily rewrite correctly written text.",
    "- Do not change ambiguous wording unless the intended meaning is reasonably clear.",
    "",
    "Output only the enhanced query text in the enhancedQuery field.",
    "No explanations, corrections, notes, Markdown, or commentary.",
  ].join("\n");
}

function normalizeEnhancedQuery(raw: string, fallback: string): string {
  let text = raw.trim();

  const quoted = /^["']([\s\S]*)["']$/.exec(text);
  if (quoted?.[1]) {
    text = quoted[1].trim();
  }

  const fenced = /^```[\s\S]*?\n([\s\S]*?)\n```$/.exec(text);
  if (fenced?.[1]) {
    text = fenced[1].trim();
  }

  if (!text) {
    text = fallback.trim();
  }

  return enhancedQuerySchema.parse(text);
}

async function runQueryEnhancerCore(
  params: QueryEnhancerParams,
  generate: typeof aiClient.generate,
): Promise<string> {
  const { abortSignal, ...rawParams } = params;
  const parsed = queryEnhancerParamsSchema.parse(rawParams);
  const model = resolveQueryEnhancerModel(parsed.model);

  const raw = await generate({
    model,
    system: parsed.system ?? buildSystemPrompt(),
    prompt: parsed.query.trim(),
    schemaName: "QueryEnhancerOutput",
    schemaDescription: "Single enhanced user query string, same intent as input.",
    output: modelOutputSchema,
    temperature: 0,
    maxOutputTokens: 512,
    abortSignal,
  });

  return normalizeEnhancedQuery(raw.enhancedQuery, parsed.query);
}

export function createQueryEnhancerAgent(options: AIClientOptions = {}) {
  const client = createAIClient(options);

  return function queryEnhancerAgent(
    params: QueryEnhancerParams,
  ): Promise<string> {
    return runQueryEnhancerCore(params, client.generate.bind(client));
  };
}

/** Return a grammar-corrected, clearer version of the user's query (plain text). */
export async function runQueryEnhancerAgent(
  params: QueryEnhancerParams,
): Promise<string> {
  return runQueryEnhancerCore(params, aiClient.generate.bind(aiClient));
}
