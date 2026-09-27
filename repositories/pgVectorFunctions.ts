import { z } from "zod";
import { aiClient } from "@/clients/AIClient";
import { prisma } from "@/db";

/** Matches OpenAI `text-embedding-3-small` default dimensions. */
export const CHAT_RESOURCE_EMBEDDING_DIMENSIONS = 1536;

const chatResourceIdSchema = z.uuid("chatResourceId must be a uuid");
const chatSessionIdSchema = z.uuid("chatSessionId must be a uuid");

const saveInputSchema = z.object({
  chatResourceId: chatResourceIdSchema,
  chatSessionId: chatSessionIdSchema,
  /** Plain-text description embedded into `chat_resource_embeddings.embedding`. */
  description: z.string().min(1, "description is required"),
});

const searchInputSchema = z.object({
  chatSessionId: chatSessionIdSchema,
  query: z.string().min(1, "query is required"),
  limit: z.number().int().min(1).max(100).optional(),
  minSimilarity: z.number().min(0).max(1).optional(),
});

export type SaveChatResourceEmbeddingInput = z.input<typeof saveInputSchema>;
export type SearchSimilarChatResourceIdsInput = z.input<typeof searchInputSchema>;

export type SimilarChatResourceMatch = {
  id: string;
  similarity: number;
};

export async function embedResourceDescriptionText(
  text: string,
): Promise<number[]> {
  const embedding = await aiClient.embedText(text);

  if (embedding.length !== CHAT_RESOURCE_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected ${CHAT_RESOURCE_EMBEDDING_DIMENSIONS} dimensions, got ${embedding.length}`,
    );
  }

  return embedding;
}

function toPgVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/**
 * Embeds `description` and stores the vector on `chat_resource_embeddings`
 * for the given research source (`chatResourceId`).
 */
export async function saveChatResourceEmbedding(
  input: SaveChatResourceEmbeddingInput,
): Promise<{ id: string; chatSessionId: string; chatResourceId: string }> {
  const { chatResourceId, chatSessionId, description } =
    saveInputSchema.parse(input);
  const embedding = await embedResourceDescriptionText(description);
  const vector = toPgVectorLiteral(embedding);

  await prisma.$executeRaw`
    INSERT INTO chat_resource_embeddings (id, chat_session_id, chat_resource_id, embedding)
    VALUES (${chatResourceId}::uuid, ${chatSessionId}::uuid, ${chatResourceId}::uuid, ${vector}::vector)
    ON CONFLICT (chat_resource_id) DO UPDATE SET
      chat_session_id = EXCLUDED.chat_session_id,
      embedding = EXCLUDED.embedding
  `;

  return { id: chatResourceId, chatSessionId, chatResourceId };
}

/**
 * Embeds `query`, compares rows for `chatSessionId`, returns research source ids
 * (`chat_resource_id`) ordered by cosine similarity (highest first).
 */
export async function searchSimilarChatResourceIds(
  input: SearchSimilarChatResourceIdsInput,
): Promise<SimilarChatResourceMatch[]> {
  const parsed = searchInputSchema.parse(input);
  const limit = parsed.limit ?? 10;
  const queryEmbedding = await embedResourceDescriptionText(parsed.query);
  const vector = toPgVectorLiteral(queryEmbedding);

  if (parsed.minSimilarity != null) {
    const rows = await prisma.$queryRaw<SimilarChatResourceMatch[]>`
      SELECT
        chat_resource_id AS id,
        (1 - (embedding <=> ${vector}::vector))::float8 AS similarity
      FROM chat_resource_embeddings
      WHERE chat_session_id = ${parsed.chatSessionId}::uuid
        AND (1 - (embedding <=> ${vector}::vector)) >= ${parsed.minSimilarity}
      ORDER BY embedding <=> ${vector}::vector
      LIMIT ${limit}
    `;
    return rows;
  }

  const rows = await prisma.$queryRaw<SimilarChatResourceMatch[]>`
    SELECT
      chat_resource_id AS id,
      (1 - (embedding <=> ${vector}::vector))::float8 AS similarity
    FROM chat_resource_embeddings
    WHERE chat_session_id = ${parsed.chatSessionId}::uuid
    ORDER BY embedding <=> ${vector}::vector
    LIMIT ${limit}
  `;

  return rows;
}

/** Convenience: returns only ids from {@link searchSimilarChatResourceIds}. */
export async function searchSimilarChatResourceIdList(
  input: SearchSimilarChatResourceIdsInput,
): Promise<string[]> {
  const matches = await searchSimilarChatResourceIds(input);
  return matches.map((row) => row.id);
}

const countInputSchema = z.object({
  chatSessionId: chatSessionIdSchema,
});

export type CountChatResourceEmbeddingsInput = z.input<typeof countInputSchema>;

/** Counts vector rows in `chat_resource_embeddings` for a session. */
export async function countChatResourceEmbeddings(
  input: CountChatResourceEmbeddingsInput,
): Promise<number> {
  const { chatSessionId } = countInputSchema.parse(input);

  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM chat_resource_embeddings
      WHERE chat_session_id = ${chatSessionId}::uuid
    `;

  return Number(rows[0]?.count ?? 0);
}
