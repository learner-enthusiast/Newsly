/** Default page size for chat message history (newest-first fetch, ascending in UI). */
export const CHAT_MESSAGES_PAGE_SIZE = 10;

/** Distance from top of scroll container before fetching older messages. */
export const CHAT_LOAD_OLDER_SCROLL_THRESHOLD_PX = 500;

export type SerializedChatMessageListItem = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

export type ChatMessageListCursor = {
  createdAt: string;
  id: string;
};

export type ChatMessagesPageResponse = {
  messages: SerializedChatMessageListItem[];
  nextCursor: ChatMessageListCursor | null;
  hasMore: boolean;
};

const CURSOR_SEPARATOR = "~";

function isUsableCursor(value: {
  createdAt: string;
  id: string;
}): boolean {
  return (
    value.createdAt.length > 0 &&
    value.id.length > 0 &&
    !Number.isNaN(Date.parse(value.createdAt))
  );
}

export function encodeChatMessageCursor(cursor: ChatMessageListCursor): string {
  return `${cursor.createdAt}${CURSOR_SEPARATOR}${cursor.id}`;
}

export function decodeChatMessageCursor(
  raw: string,
): ChatMessageListCursor | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  const separatorIndex = value.lastIndexOf(CURSOR_SEPARATOR);
  if (separatorIndex > 0 && separatorIndex < value.length - 1) {
    const cursor = {
      createdAt: value.slice(0, separatorIndex),
      id: value.slice(separatorIndex + 1),
    };
    if (isUsableCursor(cursor)) {
      return cursor;
    }
  }

  return null;
}

export function compareMessagesChronologically(
  a: SerializedChatMessageListItem,
  b: SerializedChatMessageListItem,
): number {
  const timeDiff =
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (timeDiff !== 0) {
    return timeDiff;
  }
  return a.id.localeCompare(b.id);
}

/** Merge message arrays by id; later entries win for same id. */
export function mergeChatMessagesById(
  ...groups: SerializedChatMessageListItem[][]
): SerializedChatMessageListItem[] {
  const byId = new Map<string, SerializedChatMessageListItem>();
  for (const group of groups) {
    for (const message of group) {
      byId.set(message.id, message);
    }
  }
  return [...byId.values()].sort(compareMessagesChronologically);
}
