"use client";

import {
  CHAT_MESSAGES_PAGE_SIZE,
  encodeChatMessageCursor,
  mergeChatMessagesById,
  type ChatMessageListCursor,
  type ChatMessagesPageResponse,
  type SerializedChatMessageListItem,
} from "@/services/chat/chatMessagePagination";
import { useCallback, useEffect, useRef, useState } from "react";

type UseChatMessagePagesResult = {
  messages: SerializedChatMessageListItem[];
  loadingInitial: boolean;
  loadingOlder: boolean;
  hasMoreOlder: boolean;
  olderError: string | null;
  loadOlderMessages: () => Promise<void>;
  retryLoadOlder: () => Promise<void>;
  refreshLatestPage: () => Promise<void>;
  replaceWithLatestPage: (page: ChatMessagesPageResponse) => void;
};

type LoadOlderOptions = {
  /** Retry after failure — skips hasMore check and resets in-flight guard. */
  force?: boolean;
};

async function fetchMessagesPage(
  chatSessionId: string,
  options: { before?: string | null },
  signal?: AbortSignal,
): Promise<ChatMessagesPageResponse> {
  const params = new URLSearchParams({
    limit: String(CHAT_MESSAGES_PAGE_SIZE),
  });
  if (options.before) {
    params.set("before", options.before);
  }

  const response = await fetch(
    `/api/chat/${chatSessionId}/messages?${params.toString()}`,
    { cache: "no-store", signal },
  );

  let payload: ChatMessagesPageResponse & { error?: string };
  try {
    payload = (await response.json()) as ChatMessagesPageResponse & {
      error?: string;
    };
  } catch {
    throw new Error("Couldn't load older messages");
  }

  if (!response.ok) {
    throw new Error(payload.error ?? "Couldn't load older messages");
  }
  if (!Array.isArray(payload.messages)) {
    throw new Error("Couldn't load older messages");
  }
  return payload;
}

function oldestMessageCursor(
  messages: SerializedChatMessageListItem[],
): ChatMessageListCursor | null {
  const oldest = messages.find(
    (message) => !message.id.startsWith("optimistic:"),
  );
  if (!oldest) {
    return null;
  }
  return { createdAt: oldest.createdAt, id: oldest.id };
}

function resolveNextOlderCursor(
  page: ChatMessagesPageResponse,
): ChatMessageListCursor | null {
  if (page.nextCursor) {
    return page.nextCursor;
  }
  if (page.hasMore && page.messages.length > 0) {
    return oldestMessageCursor(page.messages);
  }
  return null;
}

export function useChatMessagePages(
  chatSessionId: string,
): UseChatMessagePagesResult {
  const [messages, setMessages] = useState<SerializedChatMessageListItem[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);

  const messagesRef = useRef(messages);
  const hasMoreOlderRef = useRef(false);
  const nextOlderCursorRef = useRef<ChatMessageListCursor | null>(null);
  const loadOlderInFlightRef = useRef(false);
  const sessionEpochRef = useRef(0);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    hasMoreOlderRef.current = hasMoreOlder;
  }, [hasMoreOlder]);

  const applyLatestPageMeta = useCallback((page: ChatMessagesPageResponse) => {
    nextOlderCursorRef.current = resolveNextOlderCursor(page);
    hasMoreOlderRef.current = page.hasMore;
    setHasMoreOlder(page.hasMore);
    setOlderError(null);
  }, []);

  const replaceWithLatestPage = useCallback(
    (page: ChatMessagesPageResponse) => {
      setMessages(page.messages);
      applyLatestPageMeta(page);
    },
    [applyLatestPageMeta],
  );

  const loadInitial = useCallback(
    async (epoch: number) => {
      setLoadingInitial(true);
      setOlderError(null);
      try {
        const page = await fetchMessagesPage(chatSessionId, {});
        if (epoch !== sessionEpochRef.current) {
          return;
        }
        replaceWithLatestPage(page);
      } catch (error) {
        if (epoch === sessionEpochRef.current) {
          setOlderError(
            error instanceof Error
              ? error.message
              : "Failed to load messages",
          );
        }
      } finally {
        if (epoch === sessionEpochRef.current) {
          setLoadingInitial(false);
        }
      }
    },
    [chatSessionId, replaceWithLatestPage],
  );

  useEffect(() => {
    sessionEpochRef.current += 1;
    const epoch = sessionEpochRef.current;
    setMessages([]);
    messagesRef.current = [];
    nextOlderCursorRef.current = null;
    hasMoreOlderRef.current = false;
    setHasMoreOlder(false);
    setOlderError(null);
    loadOlderInFlightRef.current = false;
    void loadInitial(epoch);
  }, [chatSessionId, loadInitial]);

  const refreshLatestPage = useCallback(async () => {
    const epoch = sessionEpochRef.current;
    try {
      const page = await fetchMessagesPage(chatSessionId, {});
      if (epoch !== sessionEpochRef.current) {
        return;
      }
      setMessages((current) => mergeChatMessagesById(current, page.messages));
    } catch {
      /* polling refresh is best-effort */
    }
  }, [chatSessionId]);

  const loadOlderMessages = useCallback(
    async (options?: LoadOlderOptions) => {
      if (loadOlderInFlightRef.current && !options?.force) {
        return;
      }

      if (options?.force) {
        loadOlderInFlightRef.current = false;
      }

      const cursor = oldestMessageCursor(messagesRef.current);
      nextOlderCursorRef.current = cursor;

      if (!cursor) {
        if (options?.force) {
          setOlderError("Nothing older to load.");
        }
        return;
      }

      if (!options?.force && !hasMoreOlderRef.current) {
        return;
      }

      const epoch = sessionEpochRef.current;
      loadOlderInFlightRef.current = true;
      setLoadingOlder(true);
      setOlderError(null);

      try {
        const page = await fetchMessagesPage(chatSessionId, {
          before: encodeChatMessageCursor(cursor),
        });
        if (epoch !== sessionEpochRef.current) {
          return;
        }
        setMessages((current) => mergeChatMessagesById(page.messages, current));
        nextOlderCursorRef.current = resolveNextOlderCursor(page);
        hasMoreOlderRef.current = page.hasMore;
        setHasMoreOlder(page.hasMore);
      } catch (error) {
        if (epoch === sessionEpochRef.current) {
          setOlderError(
            error instanceof Error
              ? error.message
              : "Couldn't load older messages",
          );
        }
      } finally {
        loadOlderInFlightRef.current = false;
        if (epoch === sessionEpochRef.current) {
          setLoadingOlder(false);
        }
      }
    },
    [chatSessionId],
  );

  const retryLoadOlder = useCallback(async () => {
    await loadOlderMessages({ force: true });
  }, [loadOlderMessages]);

  return {
    messages,
    loadingInitial,
    loadingOlder,
    hasMoreOlder,
    olderError,
    loadOlderMessages: () => loadOlderMessages(),
    retryLoadOlder,
    refreshLatestPage,
    replaceWithLatestPage,
  };
}
