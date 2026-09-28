"use client";

import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatConversation } from "@/components/chat/ChatConversation";
import { ChatLoading } from "@/components/chat/ChatLoading";
import { ChatRightSidebar } from "@/components/chat/ChatRightSidebar";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { animateNewMessage, useChatEntrance } from "@/components/chat/useChatMotion";
import { useChatUiSuggestions } from "@/hooks/useChatUiSuggestions";
import { usePotentialStoryTopics } from "@/hooks/usePotentialStoryTopics";
import {
  createOptimisticUserMessage,
  mergeOptimisticChatMessages,
  pruneConfirmedOptimisticMessages,
  type OptimisticChatMessage,
} from "@/services/chat/chatOptimisticUi";
import { buildChatSuggestionsRefreshKey } from "@/services/chat/chatSuggestionRefreshKey";
import {
  hasAssistantReplyAfterLastUser,
  type ChatSessionSummary,
} from "@/services/chat/chatUiUtils";
import type { ChatStoryCreationPayload } from "@/services/news/newsRequestTypes";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Menu, PanelRight } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

type ChatMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

type ChatState = {
  chatSessionId: string;
  status: "initializing" | "ready" | "failed";
  storyCreation: ChatStoryCreationPayload | null;
  messages: ChatMessage[];
  chatSession: {
    id: string;
    title: string | null;
    newsStoryId: string | null;
    isFromNewsStory: boolean;
  };
};

const POLL_MS = 2000;

export function ChatLayout({ chatSessionId }: { chatSessionId: string }) {
  const router = useRouter();
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [state, setState] = useState<ChatState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<
    OptimisticChatMessage[]
  >([]);
  const conversationRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef(0);

  useChatEntrance(conversationRef, "[data-chat-welcome], [data-chat-message]", [
    chatSessionId,
    state?.messages.length,
  ]);

  const loadSessions = useCallback(async () => {
    const response = await fetch("/api/chat");
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as {
      sessions: ChatSessionSummary[];
    };
    setSessions(payload.sessions);
  }, []);

  const loadState = useCallback(async () => {
    const response = await fetch(`/api/newsStoryChat/${chatSessionId}`);
    const payload = (await response.json()) as ChatState & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to load chat");
    }
    setOptimisticMessages((pending) =>
      pruneConfirmedOptimisticMessages(pending, payload.messages),
    );
    setState(payload);
    return payload;
  }, [chatSessionId]);

  useEffect(() => {
    setOptimisticMessages([]);
  }, [chatSessionId]);

  const shouldPoll =
    state === null ||
    state.status === "initializing" ||
    state?.storyCreation?.isGenerating;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const payload = await loadState();
        if (cancelled) {
          return;
        }
        setError(null);
        void loadSessions();
        if (payload.status === "initializing" || payload.storyCreation?.isGenerating) {
          timer = setTimeout(poll, POLL_MS);
        }
      } catch (pollError) {
        if (!cancelled) {
          setError(
            pollError instanceof Error
              ? pollError.message
              : "Failed to load chat",
          );
        }
      }
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [loadState, loadSessions, chatSessionId, shouldPoll]);

  useEffect(() => {
    const count = state?.messages.length ?? 0;
    if (count > lastMessageCountRef.current && conversationRef.current) {
      const nodes = conversationRef.current.querySelectorAll("[data-chat-message]");
      const last = nodes[nodes.length - 1] as HTMLElement | undefined;
      animateNewMessage(last ?? null);
    }
    lastMessageCountRef.current = count;
  }, [state?.messages.length]);

  const title = state?.chatSession.title ?? "Chat";
  const visibleMessages = useMemo(
    () =>
      mergeOptimisticChatMessages(state?.messages ?? [], optimisticMessages),
    [state?.messages, optimisticMessages],
  );

  const suggestionsRefreshKey = useMemo(
    () => buildChatSuggestionsRefreshKey(visibleMessages),
    [visibleMessages],
  );

  const uiSuggestions = useChatUiSuggestions(
    chatSessionId,
    suggestionsRefreshKey,
  );

  const potentialStoryTopicsFetchKey =
    state?.status === "ready" &&
    !state.storyCreation?.isGenerating &&
    hasAssistantReplyAfterLastUser(visibleMessages) &&
    suggestionsRefreshKey !== "no-assistant-yet"
      ? suggestionsRefreshKey
      : null;

  const potentialStoryTopicsState = usePotentialStoryTopics(
    chatSessionId,
    potentialStoryTopicsFetchKey,
  );

  const pipelineInProgress =
    state?.status === "initializing" &&
    !hasAssistantReplyAfterLastUser(visibleMessages);

  const showWelcome =
    state?.status === "ready" &&
    visibleMessages.length === 0 &&
    !state.chatSession.isFromNewsStory;

  const storiesRefreshKey = useMemo(
    () =>
      [
        state?.storyCreation?.storyId ?? "",
        state?.storyCreation?.isGenerating ?? false,
        state?.storyCreation?.generationFailed ?? false,
        state?.messages.length ?? 0,
      ].join(":"),
    [state?.storyCreation, state?.messages.length],
  );

  const composerDisabled = state == null || pipelineInProgress;

  const composerPlaceholder =
    state != null && !pipelineInProgress
      ? visibleMessages.length === 0
        ? "Ask anything about the news…"
        : "Ask a follow-up…"
      : "Waiting for the assistant reply…";

  async function sendMessage(
    content: string,
    options?: { shouldCreateStory?: boolean },
  ) {
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
        status?: ChatState["status"];
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to send message");
      }

      if (payload.storyCreation) {
        setState((current) =>
          current
            ? {
                ...current,
                status: payload.status ?? "ready",
                storyCreation: payload.storyCreation ?? null,
              }
            : current,
        );
      }

      void loadSessions();
      await loadState();
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
  }

  function handlePrompt(
    prompt: string,
    options?: { shouldCreateStory?: boolean },
  ) {
    if (composerDisabled) {
      setDraft(prompt);
      return;
    }
    void sendMessage(prompt, options);
  }

  function navigateToSession(id: string) {
    setMobileHistoryOpen(false);
    router.push(`/chat/${id}`);
  }

  async function handleNewChat() {
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
  }

  async function handleBookmarkChat(id: string, isBookmarked: boolean) {
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
  }

  async function handleRenameChat(id: string, title: string) {
    const previousSessions = sessions;
    const previousTitle = state?.chatSession.title ?? null;

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
  }

  async function handleDeleteChat(id: string) {
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
  }

  const sidebar = (
    <ChatSidebar
      sessions={sessions}
      activeId={chatSessionId}
      onSelect={navigateToSession}
      onNewChat={() => void handleNewChat()}
      onRenameChat={(id, title) => void handleRenameChat(id, title)}
      onDeleteChat={(id) => void handleDeleteChat(id)}
      onBookmarkChat={(id, isBookmarked) =>
        void handleBookmarkChat(id, isBookmarked)
      }
      creatingChat={creatingChat}
    />
  );

  const rightSidebar = (
    <ChatRightSidebar
      potentialStoryTopics={potentialStoryTopicsState.topics}
      potentialTopicsLoading={potentialStoryTopicsState.isLoading}
      actions={uiSuggestions.actions}
      questions={uiSuggestions.questions}
      isRefreshing={uiSuggestions.isRefreshing}
      animationGeneration={uiSuggestions.generation}
      onPrompt={handlePrompt}
      disabled={composerDisabled}
    />
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-1 overflow-hidden bg-background">
      <aside className="hidden w-[270px] shrink-0 border-r border-border/40 bg-card/30 lg:flex lg:flex-col">
        {sidebar}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center gap-2 border-b border-border/40 px-3 py-2.5">
          <Sheet open={mobileHistoryOpen} onOpenChange={setMobileHistoryOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="lg:hidden"
                  aria-label="Chat history"
                />
              }
            >
              <Menu className="size-4" />
            </SheetTrigger>
            <SheetContent side="left" className="w-[min(100%,320px)] p-0">
              <SheetHeader className="border-b p-4">
                <SheetTitle>Chat history</SheetTitle>
              </SheetHeader>
              {sidebar}
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-base font-semibold">{title}</h1>
            {pipelineInProgress ? (
              <p className="text-xs text-muted-foreground">Research in progress…</p>
            ) : null}
          </div>

          <Sheet open={mobileToolsOpen} onOpenChange={setMobileToolsOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="xl:hidden"
                  aria-label="Quick actions"
                />
              }
            >
              <PanelRight className="size-4" />
            </SheetTrigger>
            <SheetContent
              side="right"
              className="flex w-[min(100%,360px)] flex-col overflow-hidden p-0"
            >
              <SheetHeader className="shrink-0 border-b p-4">
                <SheetTitle>Quick actions</SheetTitle>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <ChatRightSidebar
                  potentialStoryTopics={potentialStoryTopicsState.topics}
                  potentialTopicsLoading={potentialStoryTopicsState.isLoading}
                  actions={uiSuggestions.actions}
                  questions={uiSuggestions.questions}
                  isRefreshing={uiSuggestions.isRefreshing}
                  animationGeneration={uiSuggestions.generation}
                  onPrompt={(prompt, options) => {
                    handlePrompt(prompt, options);
                    setMobileToolsOpen(false);
                  }}
                  disabled={composerDisabled}
                />
              </div>
            </SheetContent>
          </Sheet>
        </header>

        <main ref={conversationRef} className="min-h-0 flex-1 overflow-y-auto">
          {error ? (
            <p className="p-4 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          {!state && !error ? <ChatLoading variant="initial" /> : null}

          {state ? (
            <ChatConversation
              messages={visibleMessages}
              status={state.status}
              showWelcome={showWelcome}
              storyTitle={
                state.chatSession.isFromNewsStory
                  ? state.chatSession.title
                  : null
              }
              storyCreation={state.storyCreation}
              onPrompt={handlePrompt}
              onRetry={() => {
                const lastUser = [...visibleMessages]
                  .reverse()
                  .find((message) => message.role === "user");
                if (lastUser) {
                  void sendMessage(lastUser.content);
                }
              }}
              composerDisabled={composerDisabled}
            />
          ) : null}
        </main>

        {state ? (
          <ChatComposer
            value={draft}
            onChange={setDraft}
            onSend={() => void sendMessage(draft)}
            disabled={pipelineInProgress}
            sending={sending}
            placeholder={composerPlaceholder}
            chatSessionId={chatSessionId}
            storiesRefreshKey={storiesRefreshKey}
          />
        ) : null}

        <div className="hidden min-h-0 max-h-96 shrink-0 overflow-hidden border-t border-border/40 bg-card/20 md:block xl:hidden">
          <div className="h-full max-h-96 overflow-y-auto">{rightSidebar}</div>
        </div>
      </div>

      <aside className="hidden h-full min-h-0 w-[330px] shrink-0 flex-col overflow-hidden border-l border-border/40 bg-card/20 xl:flex">
        <div className="min-h-0 flex-1 overflow-y-auto">{rightSidebar}</div>
      </aside>
    </div>
  );
}
