/**
 * Stock research prompt enhancer — first step of the stock research pipeline.
 *
 * Rewrites the user's free-text research prompt into a clear, instrument-anchored
 * research brief (grammar, typos, explicit company/symbol) and lists the focus areas
 * the report should cover. Does not invent constraints (dates, price targets,
 * horizons) the user did not give.
 *
 * Model: `STOCK_RESEARCH_PROMPT_ENHANCER_MODEL` → `OPENAI_MODEL` → default.
 */

import {
  aiClient,
  createAIClient,
  type AIClientOptions,
} from "@/clients/AIClient";
import type { StockResearchInstrument } from "@/Agents/stockResearch/toolDeterminerAgent";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import { z } from "zod";

export const promptEnhancerOutputSchema = z.object({
  enhancedPrompt: z.string().min(1).max(2000),
  focusAreas: z.array(z.string().min(1).max(200)).max(8),
});

export type PromptEnhancerOutput = z.infer<typeof promptEnhancerOutputSchema>;

export type PromptEnhancerAgentParams = {
  userPrompt: string;
  instrument: StockResearchInstrument;
  model?: string;
  abortSignal?: AbortSignal;
};

export type PromptEnhancerResult = PromptEnhancerOutput & { model: string };

export function resolvePromptEnhancerModel(override?: string): string {
  return resolveOpenAiModelId(
    override,
    process.env.STOCK_RESEARCH_PROMPT_ENHANCER_MODEL,
  );
}

function buildSystemPrompt(): string {
  return [
    "You are a prompt enhancement agent for an Indian stock market research product.",
    "The user picked a specific instrument and wrote a research prompt about it.",
    "",
    "Rewrite the prompt into a clear, self-contained research brief:",
    "- Fix grammar, spelling and obvious typos in financial terminology.",
    "- Name the company and trading symbol explicitly (from the instrument context).",
    "- Keep every constraint the user gave (time horizon, risk appetite, metrics, comparisons) exactly.",
    "- Do NOT invent constraints the user did not give: no dates, years, price targets, horizons or position sizes.",
    "- If the prompt is vague (e.g. \"is it good?\"), frame it as a balanced investment research question about the instrument.",
    "- Do not answer the question or add facts.",
    "",
    "Also return 3–8 short focusAreas the final report should cover (e.g. \"valuation vs peers\", \"recent quarterly results\", \"promoter holding trend\"), derived from the prompt and the instrument type.",
  ].join("\n");
}

async function runPromptEnhancerCore(
  params: PromptEnhancerAgentParams,
  generate: typeof aiClient.generate,
): Promise<PromptEnhancerResult> {
  const model = resolvePromptEnhancerModel(params.model);
  const output = await generate({
    model,
    system: buildSystemPrompt(),
    prompt: params.userPrompt,
    extraContext: {
      instrument: {
        name: params.instrument.name,
        shortName: params.instrument.shortName,
        tradingSymbol: params.instrument.tradingSymbol,
        exchange: params.instrument.exchange,
        segment: params.instrument.segment,
        instrumentType: params.instrument.instrumentType,
      },
    },
    schemaName: "StockResearchPromptEnhancerOutput",
    schemaDescription: "Enhanced research brief plus report focus areas.",
    output: promptEnhancerOutputSchema,
    temperature: 0,
    maxOutputTokens: 1024,
    abortSignal: params.abortSignal,
  });

  return { ...output, model };
}

export function createPromptEnhancerAgent(options: AIClientOptions = {}) {
  const client = createAIClient(options);

  return async function promptEnhancerAgent(
    params: PromptEnhancerAgentParams,
  ): Promise<PromptEnhancerResult> {
    return await runPromptEnhancerCore(params, client.generate.bind(client));
  };
}

export async function runPromptEnhancerAgent(
  params: PromptEnhancerAgentParams,
): Promise<PromptEnhancerResult> {
  return await runPromptEnhancerCore(params, aiClient.generate.bind(aiClient));
}
