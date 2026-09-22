import type { z } from "zod";

export type LlmStructuredRequest<TSchema extends z.ZodType> = {
  schema: TSchema;
  schemaName: string;
  system: string;
  prompt: string;
  model?: string;
};

/** Structured LLM extraction port (Vercel AI SDK). */
export interface LLMProvider {
  generateObject<TSchema extends z.ZodType>(
    request: LlmStructuredRequest<TSchema>,
  ): Promise<z.infer<TSchema>>;
}
