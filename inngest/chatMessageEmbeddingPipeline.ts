/**
 * Chat message memory vector index (background)
 *
 * Event: `chat/message.index.requested`
 *
 * Event data (`chatMessageIndexEventDataSchema`):
 * - `chatMessageId` — `ChatMessage` UUID to index
 * - `chatSessionId` — must match the message’s session
 *
 * Trigger: `enqueueChatMessageVectorIndexing` from `createChatMessage` via
 * `inngest.send` (fire-and-forget; errors logged, not thrown to caller).
 *
 * Function id: `chat-message-embedding-index`
 * Timeout: 15 minutes
 *
 * Purpose:
 * After any saved chat turn, produce a short memory-oriented summary and store an
 * embedding in `chat_message_embeddings` (pgvector). Used later for **conversational
 * retrieval** in follow-up chat (similarity over past turns). Explicitly **not**
 * used as verified factual evidence for news story synthesis or briefing pipelines.
 *
 * ── Steps ───────────────────────────────────────────────────────────────────
 *
 * 1. load-chat-message
 *    `getChatMessageById`; verify `chatSessionId` matches event payload.
 *
 * 2. summarize-message (skipped for unsupported roles)
 *    `runChatMessageSummarizerVectorAgent` on user/agent content;
 *    `chatRoleForMemoryDescription` filters roles that should not be indexed.
 *
 * 3. persist-message-embedding
 *    `saveChatMessageEmbedding` upsert keyed by `messageId`.
 *
 * Early return `{ skipped: true }` when role is not indexable.
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
