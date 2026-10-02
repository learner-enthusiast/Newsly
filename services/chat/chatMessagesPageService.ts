import { getChatSessionByIdForUser } from "@/repositories/chatSession";
import {
  listChatMessagesCursorPage,
  type ChatMessageCursorInput,
} from "@/repositories/chatMessage";
import {
  CHAT_MESSAGES_PAGE_SIZE,
  decodeChatMessageCursor,
  type ChatMessageListCursor,
  type ChatMessagesPageResponse,
  type SerializedChatMessageListItem,
} from "@/services/chat/chatMessagePagination";
import { z } from "zod";

const chatSessionIdSchema = z.uuid();
const chatMessageCursorSchema = z.object({
  createdAt: z.string().min(1),
  id: z.string().min(1),
});

function serializeRow(row: {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
  loadingLogs: string[];
}): SerializedChatMessageListItem {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    loadingLogs: row.loadingLogs ?? [],
  };
}

function cursorToInput(cursor: ChatMessageListCursor): ChatMessageCursorInput {
  return {
    createdAt: new Date(cursor.createdAt),
    id: cursor.id,
  };
}

export async function getChatMessagesPageForUser(input: {
  userId: string;
  chatSessionId: string;
  limit?: number;
  before?: string | null;
}): Promise<ChatMessagesPageResponse | null> {
  const parsedSessionId = chatSessionIdSchema.safeParse(input.chatSessionId);
  if (!parsedSessionId.success) {
    return null;
  }

  const session = await getChatSessionByIdForUser(
    parsedSessionId.data,
    input.userId,
  );
  if (!session) {
    return null;
  }

  const limit = input.limit ?? CHAT_MESSAGES_PAGE_SIZE;
  let beforeInput: ChatMessageCursorInput | undefined;
  if (input.before) {
    const decoded = decodeChatMessageCursor(input.before);
    const parsedCursor = chatMessageCursorSchema.safeParse(decoded);
    if (!parsedCursor.success) {
      throw new Error("Invalid cursor");
    }
    beforeInput = cursorToInput(parsedCursor.data);
  }

  const page = await listChatMessagesCursorPage({
    chatSessionId: parsedSessionId.data,
    limit,
    before: beforeInput,
  });

  const nextCursor: ChatMessageListCursor | null = page.nextCursor
    ? {
        createdAt: page.nextCursor.createdAt.toISOString(),
        id: page.nextCursor.id,
      }
    : null;

  return {
    messages: page.messages.map(serializeRow),
    hasMore: page.hasMore,
    nextCursor,
  };
}
