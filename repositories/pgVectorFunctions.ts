import { z } from "zod";
import { aiClient } from "@/clients/AIClient";
import { prisma } from "@/db";

/** Matches OpenAI `text-embedding-3-small` default dimensions. */
export const CHAT_DESCRIPTION_EMBEDDING_DIMENSIONS = 1536;

const idSchema = z.uuid("id must be a uuid");
const chatSessionIdSchema = z.uuid("chatSessionId must be a uuid");

const saveInputSchema = z.object({
  id: idSchema,
  chatSessionId: chatSessionIdSchema,
  description: z.string().min(1, "description is required"),
});

const searchInputSchema = z.object({
  chatSessionId: chatSessionIdSchema,
  query: z.string().min(1, "query is required"),
  limit: z.number().int().min(1).max(100).optional(),
  minSimilarity: z.number().min(0).max(1).optional(),
});

export type SaveChatDescriptionEmbeddingInput = z.input<typeof saveInputSchema>;
export type SearchSimilarChatDescriptionIdsInput = z.input<
  typeof searchInputSchema
>;

export type SimilarChatDescriptionMatch = {
  id: string;
  similarity: number;
};

export async function embedDescriptionText(text: string): Promise<number[]> {
  const embedding = await aiClient.embedText(text);

  if (embedding.length !== CHAT_DESCRIPTION_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected ${CHAT_DESCRIPTION_EMBEDDING_DIMENSIONS} dimensions, got ${embedding.length}`,
    );
  }

  return embedding;
}

function toPgVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/**
 * Stores (or updates) a description embedding for a chat session.
 * `id` is your external reference (e.g. research source id); it is returned on similarity hits.
 */
export async function saveChatDescriptionEmbedding(
  input: SaveChatDescriptionEmbeddingInput,
): Promise<{ id: string; chatSessionId: string }> {
  const { id, chatSessionId, description } = saveInputSchema.parse(input);
  const embedding = await embedDescriptionText(description);
  const vector = toPgVectorLiteral(embedding);

  await prisma.$executeRaw`
    INSERT INTO chat_description_embeddings (id, chat_session_id, description, embedding)
    VALUES (${id}::uuid, ${chatSessionId}::uuid, ${description}, ${vector}::vector)
    ON CONFLICT (id) DO UPDATE SET
      chat_session_id = EXCLUDED.chat_session_id,
      description = EXCLUDED.description,
      embedding = EXCLUDED.embedding
  `;

  return { id, chatSessionId };
}

/**
 * Embeds `query`, compares only rows for `chatSessionId`, and returns matching ids
 * ordered by cosine similarity (highest first).
 */
export async function searchSimilarChatDescriptionIds(
  input: SearchSimilarChatDescriptionIdsInput,
): Promise<SimilarChatDescriptionMatch[]> {
  const parsed = searchInputSchema.parse(input);
  const limit = parsed.limit ?? 10;
  const queryEmbedding = await embedDescriptionText(parsed.query);
  const vector = toPgVectorLiteral(queryEmbedding);

  if (parsed.minSimilarity != null) {
    const rows = await prisma.$queryRaw<SimilarChatDescriptionMatch[]>`
      SELECT
        id,
        (1 - (embedding <=> ${vector}::vector))::float8 AS similarity
      FROM chat_description_embeddings
      WHERE chat_session_id = ${parsed.chatSessionId}::uuid
        AND (1 - (embedding <=> ${vector}::vector)) >= ${parsed.minSimilarity}
      ORDER BY embedding <=> ${vector}::vector
      LIMIT ${limit}
    `;
    return rows;
  }

  const rows = await prisma.$queryRaw<SimilarChatDescriptionMatch[]>`
    SELECT
      id,
      (1 - (embedding <=> ${vector}::vector))::float8 AS similarity
    FROM chat_description_embeddings
    WHERE chat_session_id = ${parsed.chatSessionId}::uuid
    ORDER BY embedding <=> ${vector}::vector
    LIMIT ${limit}
  `;

  return rows;
}

/** Convenience: returns only ids from {@link searchSimilarChatDescriptionIds}. */
export async function searchSimilarChatDescriptionIdList(
  input: SearchSimilarChatDescriptionIdsInput,
): Promise<string[]> {
  const matches = await searchSimilarChatDescriptionIds(input);
  return matches.map((row) => row.id);
}
