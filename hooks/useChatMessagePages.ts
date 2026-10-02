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
  refreshLatestPage: () => Promise<SerializedChatMessageListItem[]>;
  replaceWithLatestPage: (page: ChatMessagesPageResponse) => void;
};

type LoadOlderOptions = {
  /** Retry after failure — skips hasMore check and resets in-flight guard. */
  force?: boolean;
};

type SessionPageState = {
  sessionId: string;
  messages: SerializedChatMessageListItem[];
  hasMoreOlder: boolean;
  olderError: string | null;
  loadingInitial: boolean;
  loadingOlder: boolean;
};

function emptySessionState(sessionId: string): SessionPageState {
  return {
    sessionId,
    messages: [],
    hasMoreOlder: false,
    olderError: null,
    loadingInitial: true,
    loadingOlder: false,
  };
}

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
  const [pageState, setPageState] = useState<SessionPageState>(() =>
    emptySessionState(chatSessionId),
  );
  const pageStateRef = useRef(pageState);
  const nextOlderCursorRef = useRef<ChatMessageListCursor | null>(null);
  const loadOlderInFlightRef = useRef(false);

  const isCurrentSession = pageState.sessionId === chatSessionId;
  const messages = isCurrentSession ? pageState.messages : [];
  const hasMoreOlder = isCurrentSession ? pageState.hasMoreOlder : false;
  const olderError = isCurrentSession ? pageState.olderError : null;
  const loadingInitial = !isCurrentSession || pageState.loadingInitial;
  const loadingOlder = isCurrentSession && pageState.loadingOlder;

  useEffect(() => {
    pageStateRef.current = pageState;
  }, [pageState]);

  const applyFetchedPage = useCallback(
    (sessionId: string, page: ChatMessagesPageResponse) => {
      nextOlderCursorRef.current = resolveNextOlderCursor(page);
      setPageState({
        sessionId,
        messages: page.messages,
        hasMoreOlder: page.hasMore,
        olderError: null,
        loadingInitial: false,
        loadingOlder: false,
      });
    },
    [],
  );

  const replaceWithLatestPage = useCallback(
    (page: ChatMessagesPageResponse) => {
      applyFetchedPage(chatSessionId, page);
    },
    [applyFetchedPage, chatSessionId],
  );

  useEffect(() => {
    const abort = new AbortController();
    loadOlderInFlightRef.current = false;
    nextOlderCursorRef.current = null;

    void fetchMessagesPage(chatSessionId, {}, abort.signal)
      .then((page) => {
        if (abort.signal.aborted) {
          return;
        }
        applyFetchedPage(chatSessionId, page);
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted) {
          return;
        }
        setPageState({
          sessionId: chatSessionId,
          messages: [],
          hasMoreOlder: false,
          olderError:
            error instanceof Error ? error.message : "Failed to load messages",
          loadingInitial: false,
          loadingOlder: false,
        });
      });

    return () => {
      abort.abort();
    };
  }, [chatSessionId, applyFetchedPage]);

  const refreshLatestPage = useCallback(async () => {
    try {
      const page = await fetchMessagesPage(chatSessionId, {});
      let merged: SerializedChatMessageListItem[] = [];
      setPageState((current) => {
        if (current.sessionId !== chatSessionId) {
          merged = current.messages;
          return current;
        }
        merged = mergeChatMessagesById(current.messages, page.messages);
        return {
          ...current,
          messages: merged,
        };
      });
      return merged;
    } catch {
      /* polling refresh is best-effort */
      return pageStateRef.current.sessionId === chatSessionId
        ? pageStateRef.current.messages
        : [];
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

      const current = pageStateRef.current;
      if (current.sessionId !== chatSessionId) {
        return;
      }

      const cursor = oldestMessageCursor(current.messages);
      nextOlderCursorRef.current = cursor;

      if (!cursor) {
        if (options?.force) {
          setPageState((prev) =>
            prev.sessionId === chatSessionId
              ? { ...prev, olderError: "Nothing older to load." }
              : prev,
          );
        }
        return;
      }

      if (!options?.force && !current.hasMoreOlder) {
        return;
      }

      loadOlderInFlightRef.current = true;
      setPageState((prev) =>
        prev.sessionId === chatSessionId
          ? { ...prev, loadingOlder: true, olderError: null }
          : prev,
      );

      try {
        const page = await fetchMessagesPage(chatSessionId, {
          before: encodeChatMessageCursor(cursor),
        });
        setPageState((prev) => {
          if (prev.sessionId !== chatSessionId) {
            return prev;
          }
          nextOlderCursorRef.current = resolveNextOlderCursor(page);
          return {
            ...prev,
            messages: mergeChatMessagesById(page.messages, prev.messages),
            hasMoreOlder: page.hasMore,
            loadingOlder: false,
            olderError: null,
          };
        });
      } catch (error) {
        setPageState((prev) =>
          prev.sessionId === chatSessionId
            ? {
                ...prev,
                loadingOlder: false,
                olderError:
                  error instanceof Error
                    ? error.message
                    : "Couldn't load older messages",
              }
            : prev,
        );
      } finally {
        loadOlderInFlightRef.current = false;
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
