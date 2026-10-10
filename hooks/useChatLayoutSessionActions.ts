"use client";

import {
  createOptimisticUserMessage,
  type OptimisticChatMessage,
} from "@/services/chat/chatOptimisticUi";
import type { ChatSessionSummary } from "@/services/chat/chatUiUtils";
import type { ChatLayoutState } from "@/components/chat/chatLayoutTypes";
import type { SerializedChatMessageListItem } from "@/services/chat/chatMessagePagination";
import type { ChatStoryCreationPayload } from "@/services/news/newsRequestTypes";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { toast } from "sonner";

type UseChatLayoutSessionActionsParams = {
  chatSessionId: string;
  activeSessionTitle: string | null;
  composerDisabled: boolean;
  sending: boolean;
  creatingChat: boolean;
  sessions: ChatSessionSummary[];
  setSessions: React.Dispatch<React.SetStateAction<ChatSessionSummary[]>>;
  setState: React.Dispatch<React.SetStateAction<ChatLayoutState | null>>;
  setOptimisticMessages: React.Dispatch<
    React.SetStateAction<OptimisticChatMessage[]>
  >;
  setDraft: React.Dispatch<React.SetStateAction<string>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setSending: React.Dispatch<React.SetStateAction<boolean>>;
  setCreatingChat: React.Dispatch<React.SetStateAction<boolean>>;
  setMobileHistoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  loadSessions: () => Promise<void>;
  loadState: () => Promise<ChatLayoutState>;
  refreshLatestPage: () => Promise<SerializedChatMessageListItem[]>;
};

export function useChatLayoutSessionActions({
  chatSessionId,
  activeSessionTitle,
  composerDisabled,
  sending,
  creatingChat,
  sessions,
  setSessions,
  setState,
  setOptimisticMessages,
  setDraft,
  setError,
  setSending,
  setCreatingChat,
  setMobileHistoryOpen,
  loadSessions,
  loadState,
  refreshLatestPage,
}: UseChatLayoutSessionActionsParams) {
  const router = useRouter();

  const navigateToSession = useCallback(
    (id: string) => {
      setMobileHistoryOpen(false);
      router.push(`/chat/${id}`);
    },
    [router, setMobileHistoryOpen],
  );

  const sendMessage = useCallback(
    async (content: string, options?: { shouldCreateStory?: boolean }) => {
      const trimmed = content.trim();
      if (!trimmed || composerDisabled || sending) {
        return;
      }

      const shouldCreateStory = options?.shouldCreateStory === true;
      const optimisticMessage = createOptimisticUserMessage(trimmed);

      setOptimisticMessages((current) => [...current, optimisticMessage]);
      setDraft("");
      setError(null);
      const touchedAt = new Date().toISOString();
      setSessions((current) =>
        current.map((session) =>
          session.id === chatSessionId
            ? { ...session, updatedAt: touchedAt }
            : session,
        ),
      );
      setState((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          status: shouldCreateStory ? "ready" : "initializing",
        };
      });

      setSending(true);

      try {
        const response = await fetch(`/api/chat/${chatSessionId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: trimmed,
            shouldCreateStory,
          }),
        });
        const payload = (await response.json()) as {
          error?: string;
          storyCreation?: ChatStoryCreationPayload | null;
          status?: ChatLayoutState["status"];
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to send message");
        }

        void loadSessions();
        await loadState();
        await refreshLatestPage();
      } catch (sendError) {
        setOptimisticMessages((current) =>
          current.filter((message) => message.id !== optimisticMessage.id),
        );
        setDraft(trimmed);
        void loadState().catch(() => {
          /* keep rollback UI if refetch fails */
        });
        const message =
          sendError instanceof Error
            ? sendError.message
            : "Failed to send message";
        setError(message);
        toast.error(message);
      } finally {
        setSending(false);
      }
    },
    [
      chatSessionId,
      composerDisabled,
      sending,
      setOptimisticMessages,
      setDraft,
      setError,
      setSessions,
      setState,
      setSending,
      loadSessions,
      loadState,
      refreshLatestPage,
    ],
  );

  const handlePrompt = useCallback(
    (prompt: string, options?: { shouldCreateStory?: boolean }) => {
      if (composerDisabled) {
        setDraft(prompt);
        return;
      }
      void sendMessage(prompt, options);
    },
    [composerDisabled, sendMessage, setDraft],
  );

  const handleNewChat = useCallback(async () => {
    if (creatingChat) {
      return;
    }

    setCreatingChat(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", { method: "POST" });
      const payload = (await response.json()) as {
        chatSessionId?: string;
        error?: string;
      };
      if (!response.ok || !payload.chatSessionId) {
        throw new Error(payload.error ?? "Failed to start a new chat");
      }

      await loadSessions();
      navigateToSession(payload.chatSessionId);
    } catch (newChatError) {
      toast.error(
        newChatError instanceof Error
          ? newChatError.message
          : "Failed to start a new chat",
      );
    } finally {
      setCreatingChat(false);
    }
  }, [creatingChat, loadSessions, navigateToSession, setCreatingChat, setError]);

  const handleBookmarkChat = useCallback(
    async (id: string, isBookmarked: boolean) => {
      const previous = sessions;
      setSessions((current) =>
        current.map((session) =>
          session.id === id ? { ...session, isBookmarked } : session,
        ),
      );

      try {
        const response = await fetch(`/api/chat/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isBookmarked }),
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to update bookmark");
        }
        void loadSessions();
      } catch (bookmarkError) {
        setSessions(previous);
        toast.error(
          bookmarkError instanceof Error
            ? bookmarkError.message
            : "Bookmark update failed",
        );
      }
    },
    [loadSessions, sessions, setSessions],
  );

  const handleRenameChat = useCallback(
    async (id: string, title: string) => {
      const previousSessions = sessions;
      const previousTitle =
        id === chatSessionId ? activeSessionTitle : null;

      setSessions((current) =>
        current.map((session) =>
          session.id === id ? { ...session, title } : session,
        ),
      );
      if (id === chatSessionId) {
        setState((current) =>
          current
            ? {
                ...current,
                chatSession: { ...current.chatSession, title },
              }
            : current,
        );
      }

      try {
        const response = await fetch(`/api/chat/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to rename chat");
        }
        void loadSessions();
        if (id === chatSessionId) {
          void loadState();
        }
      } catch (renameError) {
        setSessions(previousSessions);
        if (id === chatSessionId) {
          setState((current) =>
            current
              ? {
                  ...current,
                  chatSession: {
                    ...current.chatSession,
                    title: previousTitle,
                  },
                }
              : current,
          );
        }
        toast.error(
          renameError instanceof Error ? renameError.message : "Rename failed",
        );
      }
    },
    [
      activeSessionTitle,
      chatSessionId,
      loadSessions,
      loadState,
      sessions,
      setSessions,
      setState,
    ],
  );

  const handleDeleteChat = useCallback(
    async (id: string) => {
      const previousSessions = sessions;
      const remaining = sessions.filter((session) => session.id !== id);
      setSessions(remaining);

      try {
        const response = await fetch(`/api/chat/${id}`, { method: "DELETE" });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to delete chat");
        }

        if (id === chatSessionId) {
          if (remaining.length > 0) {
            navigateToSession(remaining[0]!.id);
          } else {
            void handleNewChat();
          }
        }

        void loadSessions();
      } catch (deleteError) {
        setSessions(previousSessions);
        toast.error(
          deleteError instanceof Error ? deleteError.message : "Delete failed",
        );
      }
    },
    [
      chatSessionId,
      handleNewChat,
      loadSessions,
      navigateToSession,
      sessions,
      setSessions,
    ],
  );

  return {
    sendMessage,
    handlePrompt,
    navigateToSession,
    handleNewChat,
    handleBookmarkChat,
    handleRenameChat,
    handleDeleteChat,
  };
}
