export type EmbeddingRequest = {
  texts: string[];
  model?: string;
};

export type EmbeddingResult = {
  vectors: number[][];
  model: string;
  dimensions: number;
};

/** Embedding generation port (Vercel AI SDK / OpenAI). */
export interface EmbeddingProvider {
  embed(request: EmbeddingRequest): Promise<EmbeddingResult>;
}
