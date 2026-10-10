import { generateText, Output, type LanguageModel } from "ai";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
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
  /** Optional override; default is the official OpenAI API base URL. */
  openaiBaseUrl?: string;
  openaiProjectId?: string;
  openaiModel?: string;
  openaiEmbeddingModel?: string;
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
  return raw
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-redacted")
    .replace(/ABSK[A-Za-z0-9+/=_-]+/g, "ABSK-redacted");
}

function resolveOpenAiApiKey(options: AIClientOptions) {
  const key = options.openaiApiKey ?? process.env.OPENAI_API_KEY;
  return key?.trim() ? key.trim() : null;
}

function resolveOpenAiModel(options: AIClientOptions, override?: string) {
  return resolveOpenAiModelId(override, options.openaiModel);
}

function resolveOpenAiBaseUrl(options: AIClientOptions): string | undefined {
  const baseUrl = options.openaiBaseUrl ?? process.env.OPENAI_BASE_URL?.trim();
  return baseUrl || undefined;
}

function resolveOpenAiProjectId(options: AIClientOptions): string | undefined {
  const projectId =
    options.openaiProjectId ?? process.env.OPENAI_PROJECT_ID?.trim();
  return projectId || undefined;
}

function resolveOpenAiEmbeddingModel(options: AIClientOptions): string {
  const model =
    options.openaiEmbeddingModel ??
    process.env.OPENAI_EMBEDDING_MODEL?.trim();
  return model || "text-embedding-3-small";
}

/** Reasoning models reject temperature / top_p / penalties (OpenAI + AI SDK gateway). */
function modelOmitsSamplingParams(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  const id = normalized.includes("/")
    ? (normalized.split("/").pop() ?? normalized)
    : normalized;

  if (/^o[0-9](-|$)/.test(id)) {
    return true;
  }
  if (id.includes("gpt-5")) {
    return true;
  }
  return false;
}

function languageModelId(model: LanguageModel): string | undefined {
  if (typeof model === "string") {
    return model;
  }
  if (model && typeof model === "object") {
    const record = model as { modelId?: string };
    if (typeof record.modelId === "string" && record.modelId.length > 0) {
      return record.modelId;
    }
  }
  return undefined;
}

function withoutSamplingParams(
  parsed: z.output<typeof generateParamsSchema>,
): z.output<typeof generateParamsSchema> {
  return {
    ...parsed,
    temperature: undefined,
    topP: undefined,
    topK: undefined,
    seed: undefined,
    presencePenalty: undefined,
    frequencyPenalty: undefined,
  };
}

type OpenAiParsedResponse = {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output_parsed?: unknown;
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string; parsed?: unknown }>;
  }>;
};

const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
/** Reasoning models spend tokens on internal reasoning; need a higher output budget. */
const REASONING_MIN_MAX_OUTPUT_TOKENS = 16_384;
const REASONING_RETRY_MAX_OUTPUT_TOKENS = 32_768;
const DEFAULT_STRUCTURED_RETRY_MODEL = "gpt-5";

export class OpenAiStructuredOutputError extends Error {
  readonly response?: OpenAiParsedResponse;

  constructor(message: string, response?: OpenAiParsedResponse) {
    super(message);
    this.name = "OpenAiStructuredOutputError";
    this.response = response;
  }
}

function resolveStructuredRetryModel(primaryModel: string): string {
  const configured = process.env.OPENAI_STRUCTURED_RETRY_MODEL?.trim();
  if (configured) {
    return configured;
  }
  if (primaryModel.trim().toLowerCase().includes("gpt-5")) {
    return primaryModel;
  }
  return DEFAULT_STRUCTURED_RETRY_MODEL;
}

function shouldRetryOpenAiStructuredOutput(error: unknown): boolean {
  if (error instanceof OpenAiStructuredOutputError) {
    return true;
  }
  const msg = publicErrorMessage(error);
  return msg.includes(
    "OpenAI response did not include parsed structured output",
  );
}

function resolveMaxOutputTokens(
  model: string,
  requested?: number,
  options?: { retry?: boolean },
): number {
  const base = requested ?? DEFAULT_MAX_OUTPUT_TOKENS;
  if (!modelOmitsSamplingParams(model)) {
    return options?.retry ? Math.max(base, 8192) : base;
  }
  const floor = options?.retry
    ? REASONING_RETRY_MAX_OUTPUT_TOKENS
    : REASONING_MIN_MAX_OUTPUT_TOKENS;
  return Math.max(base, floor);
}

function collectOpenAiOutputText(
  response: OpenAiParsedResponse,
): string | undefined {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  const chunks: string[] = [];
  for (const item of response.output ?? []) {
    if (item.type !== "message") {
      continue;
    }
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }

  const joined = chunks.join("").trim();
  return joined.length > 0 ? joined : undefined;
}

function extractOpenAiStructuredOutput<SCHEMA extends z.ZodType>(
  response: OpenAiParsedResponse,
  schema: SCHEMA,
): z.output<SCHEMA> | null {
  if (response.output_parsed != null) {
    const fromParsed = schema.safeParse(response.output_parsed);
    if (fromParsed.success) {
      return fromParsed.data;
    }
  }

  for (const item of response.output ?? []) {
    if (item.type !== "message") {
      continue;
    }
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.parsed != null) {
        const fromContent = schema.safeParse(content.parsed);
        if (fromContent.success) {
          return fromContent.data;
        }
      }
    }
  }

  const text = collectOpenAiOutputText(response);
  if (!text) {
    return null;
  }

  try {
    const json = JSON.parse(text) as unknown;
    const fromText = schema.safeParse(json);
    if (fromText.success) {
      return fromText.data;
    }
  } catch {
    return null;
  }

  return null;
}

function openAiStructuredOutputError(response: OpenAiParsedResponse): string {
  const parts = ["OpenAI response did not include parsed structured output"];
  if (response.status) {
    parts.push(`status=${response.status}`);
  }
  if (response.incomplete_details?.reason) {
    parts.push(`incomplete=${response.incomplete_details.reason}`);
  }
  const preview = collectOpenAiOutputText(response);
  if (preview) {
    parts.push(`output_text_chars=${preview.length}`);
  }
  return parts.join("; ");
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

    const baseURL = resolveOpenAiBaseUrl(options);
    const project = resolveOpenAiProjectId(options);

    openaiClient ??= new OpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
      ...(project ? { project } : {}),
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
    retryAttempt?: boolean;
  }): Promise<z.output<SCHEMA>> {
    const omitSampling = modelOmitsSamplingParams(params.model);
    const maxOutputTokens = resolveMaxOutputTokens(
      params.model,
      params.parsed.maxOutputTokens,
      { retry: params.retryAttempt },
    );
    const response = (await params.client.responses.parse(
      {
        model: params.model,
        instructions: params.parsed.system,
        input: buildPrompt(params.parsed.prompt, params.parsed.extraContext),
        text: {
          format: zodTextFormat(params.outputSchema, params.schemaName, {
            description: params.parsed.schemaDescription,
          }),
        },
        max_output_tokens: maxOutputTokens,
        ...(omitSampling
          ? {
              reasoning: {
                effort: params.retryAttempt
                  ? ("minimal" as const)
                  : ("low" as const),
              },
            }
          : {}),
        ...(!omitSampling && params.parsed.temperature != null
          ? { temperature: params.parsed.temperature }
          : {}),
        ...(!omitSampling && params.parsed.topP != null
          ? { top_p: params.parsed.topP }
          : {}),
        ...(!omitSampling && params.parsed.seed != null
          ? { seed: params.parsed.seed }
          : {}),
      },
      { signal: params.abortSignal },
    )) as OpenAiParsedResponse;

    const structured = extractOpenAiStructuredOutput(
      response,
      params.outputSchema,
    );
    if (structured != null) {
      return structured;
    }

    throw new OpenAiStructuredOutputError(
      openAiStructuredOutputError(response),
      response,
    );
  }

  async function generateWithVercelAI<SCHEMA extends z.ZodType>(params: {
    model: LanguageModel;
    parsed: z.output<typeof generateParamsSchema>;
    outputSchema: SCHEMA;
    options: AIClientOptions;
    abortSignal?: AbortSignal;
  }): Promise<z.output<SCHEMA>> {
    const modelId = languageModelId(params.model) ?? params.parsed.model ?? "";
    const omitSampling = modelId ? modelOmitsSamplingParams(modelId) : false;
    const parsed = omitSampling
      ? withoutSamplingParams(params.parsed)
      : params.parsed;

    const maxOutputTokens = resolveMaxOutputTokens(
      modelId || "unknown",
      parsed.maxOutputTokens,
    );

    const { output } = await generateText({
      model: params.model,
      prompt: buildPrompt(parsed.prompt, parsed.extraContext),
      system: parsed.system,
      output: Output.object({
        schema: params.outputSchema,
        name: parsed.schemaName,
        description: parsed.schemaDescription,
      }),
      maxOutputTokens,
      ...(parsed.temperature != null
        ? { temperature: parsed.temperature }
        : {}),
      ...(parsed.topP != null ? { topP: parsed.topP } : {}),
      ...(parsed.topK != null ? { topK: parsed.topK } : {}),
      ...(parsed.presencePenalty != null
        ? { presencePenalty: parsed.presencePenalty }
        : {}),
      ...(parsed.frequencyPenalty != null
        ? { frequencyPenalty: parsed.frequencyPenalty }
        : {}),
      ...(parsed.seed != null ? { seed: parsed.seed } : {}),
      maxRetries: parsed.maxRetries ?? params.options.maxRetries,
      timeout: parsed.timeout ?? params.options.timeout,
      abortSignal: params.abortSignal,
    });

    return params.outputSchema.parse(output);
  }

  return {
    async generate<SCHEMA extends z.ZodType>(
      params: AIGenerateParams<SCHEMA>,
    ): Promise<z.output<SCHEMA>> {
      const { output: outputSchema, abortSignal, ...rawParams } = params;
      let parsed = generateParamsSchema.parse(rawParams);
      const schemaName = parsed.schemaName ?? "StructuredOutput";
      const openAiModel = resolveOpenAiModel(options, parsed.model);
      const vercelModel = resolveVercelModel(options, parsed.model);
      const vercelModelId = languageModelId(vercelModel) ?? parsed.model ?? "";
      if (
        modelOmitsSamplingParams(openAiModel) ||
        (vercelModelId && modelOmitsSamplingParams(vercelModelId))
      ) {
        parsed = withoutSamplingParams(parsed);
      }
      const openai = getOpenAI();

      if (openai) {
        try {
          return await generateWithOpenAI({
            client: openai,
            model: openAiModel,
            parsed,
            outputSchema,
            schemaName,
            abortSignal,
          });
        } catch (error) {
          if (shouldRetryOpenAiStructuredOutput(error)) {
            const retryModel = resolveStructuredRetryModel(openAiModel);
            console.warn(
              JSON.stringify({
                scope: "aiClient",
                action: "openai-structured-retry",
                primaryModel: openAiModel,
                retryModel,
                reason: publicErrorMessage(error),
              }),
            );
            return await generateWithOpenAI({
              client: openai,
              model: retryModel,
              parsed,
              outputSchema,
              schemaName,
              abortSignal,
              retryAttempt: true,
            });
          }

          throw error instanceof Error
            ? error
            : new Error(publicErrorMessage(error));
        }
      }

      return generateWithVercelAI({
        model: vercelModel,
        parsed,
        outputSchema,
        options,
        abortSignal,
      });
    },

    async embedText(text: string): Promise<number[]> {
      const trimmed = text.trim();
      if (!trimmed) {
        throw new Error("Cannot embed an empty string");
      }

      const openai = getOpenAI();
      if (!openai) {
        throw new Error("OpenAI API key is required for embeddings");
      }

      const response = await openai.embeddings.create({
        model: resolveOpenAiEmbeddingModel(options),
        input: trimmed,
      });

      const embedding = response.data[0]?.embedding;
      if (!embedding?.length) {
        throw new Error("Embedding API returned no vector");
      }

      return embedding;
    },
  };
}

function createDefaultAIClient() {
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiKey) {
    return createAIClient({
      openaiApiKey: openAiKey,
      openaiBaseUrl: process.env.OPENAI_BASE_URL?.trim(),
      openaiProjectId: process.env.OPENAI_PROJECT_ID?.trim(),
      openaiModel: process.env.OPENAI_MODEL?.trim(),
    });
  }

  return createAIClient({
    defaultModel:
      process.env.AI_MODEL ?? "inclusionai/ling-3.0-flash-sante-free",
  });
}

export const aiClient = createDefaultAIClient();
