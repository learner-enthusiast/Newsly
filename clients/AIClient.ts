import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";

const extraContextSchema = z.unknown().optional();

const generateParamsSchema = z.object({
  model: z.string().min(1).optional(),
  prompt: z.string().min(1, "prompt is required"),
  system: z.string().min(1).optional(),
  extraContext: extraContextSchema,
  schemaName: z.string().min(1).optional(),
  schemaDescription: z.string().min(1).optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  topK: z.number().int().positive().optional(),
  presencePenalty: z.number().min(-1).max(1).optional(),
  frequencyPenalty: z.number().min(-1).max(1).optional(),
  seed: z.number().int().optional(),
  maxRetries: z.number().int().min(0).optional(),
  timeout: z.number().int().positive().optional(),
});

export type AIClientOptions = {
  defaultModel?: LanguageModel;
  timeout?: number;
  maxRetries?: number;
};

export type AIGenerateParams<SCHEMA extends z.ZodType> = z.input<
  typeof generateParamsSchema
> & {
  output: SCHEMA;
  abortSignal?: AbortSignal;
};

function formatExtraContext(context: unknown): string | undefined {
  if (context == null) {
    return undefined;
  }

  if (typeof context === "string") {
    const trimmed = context.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  return JSON.stringify(context, null, 2);
}

function buildPrompt(prompt: string, extraContext: unknown): string {
  const formattedContext = formatExtraContext(extraContext);

  if (!formattedContext) {
    return prompt;
  }

  return `${prompt}\n\nAdditional context:\n${formattedContext}`;
}

export function createAIClient(options: AIClientOptions = {}) {
  return {
    async generate<SCHEMA extends z.ZodType>(
      params: AIGenerateParams<SCHEMA>,
    ): Promise<z.output<SCHEMA>> {
      const { output: outputSchema, abortSignal, ...rawParams } = params;
      const parsed = generateParamsSchema.parse(rawParams);
      const model =
        parsed.model ?? options.defaultModel ?? process.env.AI_MODEL;

      if (!model) {
        throw new Error("model is required, or set AI_MODEL / defaultModel");
      }

      const { output } = await generateText({
        model,
        prompt: buildPrompt(parsed.prompt, parsed.extraContext),
        system: parsed.system,
        output: Output.object({
          schema: outputSchema,
          name: parsed.schemaName,
          description: parsed.schemaDescription,
        }),
        maxOutputTokens: parsed.maxOutputTokens,
        temperature: parsed.temperature,
        topP: parsed.topP,
        topK: parsed.topK,
        presencePenalty: parsed.presencePenalty,
        frequencyPenalty: parsed.frequencyPenalty,
        seed: parsed.seed,
        maxRetries: parsed.maxRetries ?? options.maxRetries,
        timeout: parsed.timeout ?? options.timeout,
        abortSignal,
      });

      return outputSchema.parse(output);
    },
  };
}

export const aiClient = createAIClient({
  defaultModel: "xai/grok-4.6",
});
