import { randomUUID } from "node:crypto";
import { z } from "zod";
import { aiClient } from "@/clients/AIClient";
import { prisma } from "@/db";

/** Matches OpenAI `text-embedding-3-small` default dimensions. */
export const CHAT_MESSAGE_EMBEDDING_DIMENSIONS = 1536;

const messageIdSchema = z.uuid("messageId must be a uuid");
const chatSessionIdSchema = z.uuid("chatSessionId must be a uuid");

const saveInputSchema = z.object({
  messageId: messageIdSchema,
  chatSessionId: chatSessionIdSchema,
  content: z.string().min(1, "content is required"),
});

const searchInputSchema = z.object({
  chatSessionId: chatSessionIdSchema,
  query: z.string().min(1, "query is required"),
  limit: z.number().int().min(1).max(100).optional(),
  minSimilarity: z.number().min(0).max(1).optional(),
});

export type SaveChatMessageEmbeddingInput = z.input<typeof saveInputSchema>;
export type SearchSimilarChatMessageIdsInput = z.input<typeof searchInputSchema>;

export type SimilarChatMessageMatch = {
  id: string;
  similarity: number;
};

async function embedMessageText(text: string): Promise<number[]> {
  const embedding = await aiClient.embedText(text);

  if (embedding.length !== CHAT_MESSAGE_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected ${CHAT_MESSAGE_EMBEDDING_DIMENSIONS} dimensions, got ${embedding.length}`,
    );
  }

  return embedding;
}

function toPgVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/** Embeds message `content` and upserts `chat_message_embeddings` for `messageId`. */
export async function saveChatMessageEmbedding(
  input: SaveChatMessageEmbeddingInput,
): Promise<{ id: string; messageId: string; chatSessionId: string }> {
  const { messageId, chatSessionId, content } = saveInputSchema.parse(input);
  const embedding = await embedMessageText(content);
  const vector = toPgVectorLiteral(embedding);
  const id = randomUUID();

  await prisma.$executeRaw`
    INSERT INTO chat_message_embeddings (id, message_id, chat_session_id, embedding)
    VALUES (${id}::uuid, ${messageId}::uuid, ${chatSessionId}::uuid, ${vector}::vector)
    ON CONFLICT (message_id) DO UPDATE SET
      chat_session_id = EXCLUDED.chat_session_id,
      embedding = EXCLUDED.embedding
  `;

  const row = await prisma.chatMessageEmbedding.findUnique({
    where: { messageId },
    select: { id: true, messageId: true, chatSessionId: true },
  });

  if (!row) {
    throw new Error("Failed to persist chat message embedding");
  }

  return row;
}

/**
 * Embeds `query`, compares rows for `chatSessionId`, returns message ids ordered
 * by cosine similarity (highest first).
 */
export async function searchSimilarChatMessageIds(
  input: SearchSimilarChatMessageIdsInput,
): Promise<SimilarChatMessageMatch[]> {
  const parsed = searchInputSchema.parse(input);
  const limit = parsed.limit ?? 10;
  const queryEmbedding = await embedMessageText(parsed.query);
  const vector = toPgVectorLiteral(queryEmbedding);

  if (parsed.minSimilarity != null) {
    const rows = await prisma.$queryRaw<SimilarChatMessageMatch[]>`
      SELECT
        message_id AS id,
        (1 - (embedding <=> ${vector}::vector))::float8 AS similarity
      FROM chat_message_embeddings
      WHERE chat_session_id = ${parsed.chatSessionId}::uuid
        AND (1 - (embedding <=> ${vector}::vector)) >= ${parsed.minSimilarity}
      ORDER BY embedding <=> ${vector}::vector
      LIMIT ${limit}
    `;
    return rows;
  }

  const rows = await prisma.$queryRaw<SimilarChatMessageMatch[]>`
    SELECT
      message_id AS id,
      (1 - (embedding <=> ${vector}::vector))::float8 AS similarity
    FROM chat_message_embeddings
    WHERE chat_session_id = ${parsed.chatSessionId}::uuid
    ORDER BY embedding <=> ${vector}::vector
    LIMIT ${limit}
  `;

  return rows;
}

export async function searchSimilarChatMessageIdList(
  input: SearchSimilarChatMessageIdsInput,
): Promise<string[]> {
  const matches = await searchSimilarChatMessageIds(input);
  return matches.map((row) => row.id);
}

const countInputSchema = z.object({
  chatSessionId: chatSessionIdSchema,
});

export type CountChatMessageEmbeddingsInput = z.input<typeof countInputSchema>;

export async function countChatMessageEmbeddings(
  input: CountChatMessageEmbeddingsInput,
): Promise<number> {
  const { chatSessionId } = countInputSchema.parse(input);

  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM chat_message_embeddings
    WHERE chat_session_id = ${chatSessionId}::uuid
  `;

  return Number(rows[0]?.count ?? 0);
}

export async function getChatMessageEmbeddingByMessageId(messageId: string) {
  return prisma.chatMessageEmbedding.findUnique({
    where: { messageId: messageIdSchema.parse(messageId) },
  });
}

export async function deleteChatMessageEmbeddingByMessageId(messageId: string) {
  return prisma.chatMessageEmbedding.delete({
    where: { messageId: messageIdSchema.parse(messageId) },
  });
}
