import { generateText, Output, type LanguageModel } from "ai";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
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
  openaiApiKey?: string;
  openaiModel?: string;
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

function publicErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/sk-[A-Za-z0-9_-]+/g, "sk-redacted");
}

function resolveOpenAiApiKey(options: AIClientOptions) {
  const key = options.openaiApiKey ?? process.env.OPENAI_API_KEY;
  return key?.trim() ? key.trim() : null;
}

function resolveOpenAiModel(options: AIClientOptions, override?: string) {
  return (
    override ?? options.openaiModel ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini"
  );
}

function resolveVercelModel(
  options: AIClientOptions,
  override?: string,
): LanguageModel {
  const model =
    override ?? options.defaultModel ?? process.env.AI_MODEL ?? undefined;

  if (!model) {
    throw new Error(
      "Vercel AI model is required: set AI_MODEL, defaultModel, or pass model",
    );
  }

  return model;
}

export function createAIClient(options: AIClientOptions = {}) {
  let openaiClient: OpenAI | undefined;

  const getOpenAI = () => {
    const apiKey = resolveOpenAiApiKey(options);
    if (!apiKey) {
      return null;
    }

    openaiClient ??= new OpenAI({
      apiKey,
      timeout: options.timeout,
      maxRetries: options.maxRetries,
    });

    return openaiClient;
  };

  async function generateWithOpenAI<SCHEMA extends z.ZodType>(params: {
    client: OpenAI;
    model: string;
    parsed: z.output<typeof generateParamsSchema>;
    outputSchema: SCHEMA;
    schemaName: string;
    abortSignal?: AbortSignal;
  }): Promise<z.output<SCHEMA>> {
    const response = await params.client.responses.parse(
      {
        model: params.model,
        instructions: params.parsed.system,
        input: buildPrompt(params.parsed.prompt, params.parsed.extraContext),
        text: {
          format: zodTextFormat(params.outputSchema, params.schemaName, {
            description: params.parsed.schemaDescription,
          }),
        },
        max_output_tokens: params.parsed.maxOutputTokens,
        temperature: params.parsed.temperature,
        top_p: params.parsed.topP,
        ...(params.parsed.seed != null ? { seed: params.parsed.seed } : {}),
      },
      { signal: params.abortSignal },
    );

    if (response.output_parsed == null) {
      throw new Error(
        "OpenAI response did not include parsed structured output",
      );
    }

    return params.outputSchema.parse(response.output_parsed);
  }

  async function generateWithVercelAI<SCHEMA extends z.ZodType>(params: {
    model: LanguageModel;
    parsed: z.output<typeof generateParamsSchema>;
    outputSchema: SCHEMA;
    options: AIClientOptions;
    abortSignal?: AbortSignal;
  }): Promise<z.output<SCHEMA>> {
    const { output } = await generateText({
      model: params.model,
      prompt: buildPrompt(params.parsed.prompt, params.parsed.extraContext),
      system: params.parsed.system,
      output: Output.object({
        schema: params.outputSchema,
        name: params.parsed.schemaName,
        description: params.parsed.schemaDescription,
      }),
      maxOutputTokens: params.parsed.maxOutputTokens,
      temperature: params.parsed.temperature,
      topP: params.parsed.topP,
      topK: params.parsed.topK,
      presencePenalty: params.parsed.presencePenalty,
      frequencyPenalty: params.parsed.frequencyPenalty,
      seed: params.parsed.seed,
      maxRetries: params.parsed.maxRetries ?? params.options.maxRetries,
      timeout: params.parsed.timeout ?? params.options.timeout,
      abortSignal: params.abortSignal,
    });

    return params.outputSchema.parse(output);
  }

  return {
    async generate<SCHEMA extends z.ZodType>(
      params: AIGenerateParams<SCHEMA>,
    ): Promise<z.output<SCHEMA>> {
      const { output: outputSchema, abortSignal, ...rawParams } = params;
      const parsed = generateParamsSchema.parse(rawParams);
      const schemaName = parsed.schemaName ?? "StructuredOutput";
      const openai = getOpenAI();

      if (openai) {
        try {
          return await generateWithOpenAI({
            client: openai,
            model: resolveOpenAiModel(options, parsed.model),
            parsed,
            outputSchema,
            schemaName,
            abortSignal,
          });
        } catch (error) {
          console.warn(
            JSON.stringify({
              scope: "aiClient",
              primary: "openai",
              fallback: "vercel-ai",
              error: publicErrorMessage(error),
            }),
          );
        }
      }

      const vercelModel = resolveVercelModel(options, parsed.model);
      return generateWithVercelAI({
        model: vercelModel,
        parsed,
        outputSchema,
        options,
        abortSignal,
      });
    },
  };
}

export const aiClient = createAIClient({
  defaultModel: process.env.AI_MODEL ?? "inclusionai/ling-3.0-flash-sante-free",
});
