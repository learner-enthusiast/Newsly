/**
 * Chat message memory vector index (background)
 *
 * Event: `chat/message.index.requested`
 * Input: `{ chatMessageId, chatSessionId }`
 *
 * Trigger: `enqueueChatMessageVectorIndexing` from `createChatMessage` (fire-and-forget).
 * Timeout: 15 minutes.
 *
 * Purpose:
 * Summarize a saved chat turn for conversational memory retrieval (pgvector on
 * `chat_message_embeddings`). Used to enrich follow-up chat context — not as
 * factual evidence for news story synthesis.
 *
 * Steps:
 * 1. load-chat-message — Verify row exists and session id matches event.
 * 2. summarize-message — `runChatMessageSummarizerVectorAgent` (skips unsupported roles).
 * 3. persist-message-embedding — Upsert embedding keyed by message id.
 */

import {
  chatRoleForMemoryDescription,
  runChatMessageSummarizerVectorAgent,
} from "@/Agents/chat/chatMessageSummarizerVectorAgent";
import { createPipelineLogger } from "@/clients/pipelineLogger";
import { inngest } from "@/clients/inngestClient";
import { getChatMessageById } from "@/repositories/chatMessage";
import { saveChatMessageEmbedding } from "@/repositories/chatMessageEmbedding";
import { toJsonSafeStepOutput } from "@/services/news/normalizeArticles";
import { z } from "zod";

export const CHAT_MESSAGE_INDEX_EVENT = "chat/message.index.requested" as const;

export const chatMessageIndexEventDataSchema = z.object({
  chatMessageId: z.uuid(),
  chatSessionId: z.uuid(),
});

export type ChatMessageIndexEventData = z.infer<
  typeof chatMessageIndexEventDataSchema
>;

const PIPELINE_LOG_PREFIX = "[chat-message-index]";
const indexLog = createPipelineLogger(PIPELINE_LOG_PREFIX);

/** Fire-and-forget: enqueue message summarization + vector indexing. */
export function enqueueChatMessageVectorIndexing(
  data: ChatMessageIndexEventData,
): void {
  const parsed = chatMessageIndexEventDataSchema.parse(data);
  void inngest
    .send({
      name: CHAT_MESSAGE_INDEX_EVENT,
      data: parsed,
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      indexLog("enqueue", "failed", {
        chatMessageId: parsed.chatMessageId,
        error: message,
      });
    });
}

export const chatMessageEmbeddingFunction = inngest.createFunction(
  {
    id: "chat-message-embedding-index",
    name: "Chat message memory vector index",
    triggers: [{ event: CHAT_MESSAGE_INDEX_EVENT }],
    timeouts: { finish: "15m" },
  },
  async ({ event, step }) => {
    const input = chatMessageIndexEventDataSchema.parse(event.data);

    indexLog("run", "started", {
      chatMessageId: input.chatMessageId,
      chatSessionId: input.chatSessionId,
    });

    const message = await step.run("load-chat-message", async () => {
      const row = await getChatMessageById(input.chatMessageId);
      if (!row) {
        throw new Error("Chat message not found");
      }
      if (row.chatSessionId !== input.chatSessionId) {
        throw new Error("Chat message session mismatch");
      }
      return toJsonSafeStepOutput(row);
    });

    const memoryRole = chatRoleForMemoryDescription(message.role);
    if (!memoryRole) {
      indexLog("run", "skipped", {
        chatMessageId: message.id,
        reason: "unsupported role",
        role: message.role,
      });
      return toJsonSafeStepOutput({ chatMessageId: message.id, skipped: true });
    }

    const description = await step.run("summarize-message", async () => {
      indexLog("summarize-message", "start", { id: message.id });
      const text = await runChatMessageSummarizerVectorAgent({
        messageId: message.id,
        chatSessionId: message.chatSessionId,
        role: memoryRole,
        message: message.content,
        abortSignal: AbortSignal.timeout(120_000),
      });
      indexLog("summarize-message", "done", {
        id: message.id,
        length: text.length,
      });
      return text;
    });

    await step.run("persist-message-embedding", async () => {
      indexLog("persist-message-embedding", "start", { id: message.id });
      await saveChatMessageEmbedding({
        messageId: message.id,
        chatSessionId: message.chatSessionId,
        content: description,
      });
      indexLog("persist-message-embedding", "done", { id: message.id });
      return { id: message.id };
    });

    indexLog("run", "finished", { chatMessageId: message.id });
    return toJsonSafeStepOutput({ chatMessageId: message.id, description });
  },
);
