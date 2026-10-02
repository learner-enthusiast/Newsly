import { chatRoleForMemoryDescription } from "@/Agents/chat/chatMessageSummarizerVectorAgent";
import { enqueueChatMessageVectorIndexing } from "@/inngest/chatMessageEmbeddingPipeline";
import { z } from "zod";
import { prisma } from "@/db";

const chatMessageIdSchema = z.uuid("id must be a uuid");
const chatSessionIdSchema = z.uuid("chatSessionId must be a uuid");
const scriptIdSchema = z.uuid("scriptId must be a uuid");

const newsStoryIdSchema = z.uuid("newsStoryId must be a uuid");

const chatMessageWriteSchema = z.object({
  chatSessionId: chatSessionIdSchema,
  role: z.string().min(1),
  content: z.string().min(1),
  scriptId: scriptIdSchema.nullable().optional(),
  loadingLogs: z.array(z.string()).optional(),
  isAStoryRequest: z.boolean().optional(),
  newsStoryId: newsStoryIdSchema.nullable().optional(),
  isRerunning: z.boolean().optional(),
});

const chatMessagePutSchema = chatMessageWriteSchema.omit({ chatSessionId: true });
const chatMessagePatchSchema = chatMessagePutSchema.partial();

export type ChatMessageCreateInput = z.input<typeof chatMessageWriteSchema>;
export type ChatMessagePutInput = z.input<typeof chatMessagePutSchema>;
export type ChatMessagePatchInput = z.input<typeof chatMessagePatchSchema>;

export async function appendChatMessageLoadingLog(
  messageId: string,
  message: string,
) {
  const trimmed = message.trim();
  if (!trimmed) {
    return null;
  }
  return prisma.chatMessage.update({
    where: { id: chatMessageIdSchema.parse(messageId) },
    data: {
      loadingLogs: { push: trimmed },
    },
  });
}

export async function createChatMessage(input: ChatMessageCreateInput) {
  const saved = await prisma.chatMessage.create({
    data: chatMessageWriteSchema.parse(input),
  });

  if (chatRoleForMemoryDescription(saved.role)) {
    enqueueChatMessageVectorIndexing({
      chatMessageId: saved.id,
      chatSessionId: saved.chatSessionId,
    });
  }

  return saved;
}

export async function getChatMessageById(id: string) {
  return prisma.chatMessage.findUnique({
    where: { id: chatMessageIdSchema.parse(id) },
  });
}

export async function getUserChatMessageForSession(
  chatSessionId: string,
  chatMessageId: string,
) {
  const message = await getChatMessageById(chatMessageId);
  if (!message || message.chatSessionId !== chatSessionIdSchema.parse(chatSessionId)) {
    return null;
  }
  return message;
}

/** First assistant reply created after the given user message (pipeline idempotency). */
export async function findAssistantReplyAfterUserMessage(
  chatSessionId: string,
  userMessageId: string,
) {
  const userMessage = await getUserChatMessageForSession(
    chatSessionId,
    userMessageId,
  );
  if (!userMessage) {
    return null;
  }

  return prisma.chatMessage.findFirst({
    where: {
      chatSessionId: chatSessionIdSchema.parse(chatSessionId),
      role: { in: ["agent", "assistant"] },
      createdAt: { gt: userMessage.createdAt },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function listChatMessagesByChatSessionId(chatSessionId: string) {
  return prisma.chatMessage.findMany({
    where: { chatSessionId: chatSessionIdSchema.parse(chatSessionId) },
    orderBy: { createdAt: "asc" },
  });
}

export async function listRecentChatMessagesByChatSessionId(
  chatSessionId: string,
  limit = 10,
) {
  const rows = await prisma.chatMessage.findMany({
    where: { chatSessionId: chatSessionIdSchema.parse(chatSessionId) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });
  return rows.reverse();
}

export type ChatMessageCursorInput = {
  createdAt: Date;
  id: string;
};

export async function listChatMessagesCursorPage(input: {
  chatSessionId: string;
  limit: number;
  before?: ChatMessageCursorInput;
}) {
  const sessionId = chatSessionIdSchema.parse(input.chatSessionId);
  const take = Math.min(Math.max(input.limit, 1), 100);

  const rows = await prisma.chatMessage.findMany({
    where: {
      chatSessionId: sessionId,
      ...(input.before
        ? { createdAt: { lte: input.before.createdAt } }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 2,
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
      loadingLogs: true,
      isAStoryRequest: true,
      newsStoryId: true,
    },
  });

  const before = input.before;
  const olderThanCursor = before
    ? rows.filter((row) => {
        const timeDiff =
          row.createdAt.getTime() - before.createdAt.getTime();
        if (timeDiff !== 0) {
          return timeDiff < 0;
        }
        return row.id < before.id;
      })
    : rows;

  const hasMore = olderThanCursor.length > take;
  const pageDesc = hasMore ? olderThanCursor.slice(0, take) : olderThanCursor;
  const messages = [...pageDesc].reverse();
  const oldest = messages[0];

  return {
    messages,
    hasMore,
    nextCursor:
      hasMore && oldest
        ? { createdAt: oldest.createdAt, id: oldest.id }
        : null,
  };
}

export async function putChatMessage(id: string, input: ChatMessagePutInput) {
  return prisma.chatMessage.update({
    where: { id: chatMessageIdSchema.parse(id) },
    data: chatMessagePutSchema.parse(input),
  });
}

export async function patchChatMessage(id: string, input: ChatMessagePatchInput) {
  return prisma.chatMessage.update({
    where: { id: chatMessageIdSchema.parse(id) },
    data: chatMessagePatchSchema.parse(input),
  });
}

/** Flip `isRerunning` for a message by id. Returns null if the row does not exist. */
export async function toggleChatMessageIsRerunning(messageId: string) {
  const id = chatMessageIdSchema.parse(messageId);
  const current = await prisma.chatMessage.findUnique({
    where: { id },
    select: { isRerunning: true },
  });
  if (!current) {
    return null;
  }

  return prisma.chatMessage.update({
    where: { id },
    data: { isRerunning: !current.isRerunning },
  });
}

/** Set `isRerunning` explicitly (e.g. pipeline start/stop). Returns null if missing. */
export async function setChatMessageIsRerunning(
  messageId: string,
  isRerunning: boolean,
) {
  const id = chatMessageIdSchema.parse(messageId);
  const next = z.boolean().parse(isRerunning);
  const existing = await prisma.chatMessage.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    return null;
  }

  return prisma.chatMessage.update({
    where: { id },
    data: { isRerunning: next },
  });
}

export async function updateChatStoryRequestAssistantMessage(input: {
  chatSessionId: string;
  userMessageId: string;
  content: string;
  newsStoryId: string;
  loadingLog?: string;
}) {
  const assistant = await findAssistantReplyAfterUserMessage(
    input.chatSessionId,
    input.userMessageId,
  );
  if (!assistant) {
    return null;
  }

  if (input.loadingLog?.trim()) {
    await appendChatMessageLoadingLog(assistant.id, input.loadingLog);
  }

  return patchChatMessage(assistant.id, {
    content: input.content,
    isAStoryRequest: true,
    newsStoryId: input.newsStoryId,
  });
}

export async function deleteChatMessage(id: string) {
  return prisma.chatMessage.delete({
    where: { id: chatMessageIdSchema.parse(id) },
  });
}
