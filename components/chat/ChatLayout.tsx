"use client";

import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatScrollToBottomFab } from "@/components/chat/ChatScrollToBottomFab";
import { ChatConversation } from "@/components/chat/ChatConversation";
import { ChatLoading } from "@/components/chat/ChatLoading";
import { ChatRightSidebar } from "@/components/chat/ChatRightSidebar";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { animateNewMessage, useChatEntrance } from "@/components/chat/useChatMotion";
import { useChatUiSuggestions } from "@/hooks/useChatUiSuggestions";
import { useChatMessagePages } from "@/hooks/useChatMessagePages";
import { usePotentialStoryTopicPages } from "@/hooks/usePotentialStoryTopicPages";
import {
  getComposerPlaceholder,
  getPotentialStoryTopicsFetchKey,
  isMessageResearchBlockingChat,
  shouldScheduleChatPoll,
} from "@/components/chat/chatLayoutHelpers";
import { listStoryIdsAwaitingChatUpdate } from "@/services/chat/chatStoryRequestMessage";
import {
  mergeOptimisticChatMessages,
  pruneConfirmedOptimisticMessages,
  type OptimisticChatMessage,
} from "@/services/chat/chatOptimisticUi";
import { useChatLayoutSessionActions } from "@/hooks/useChatLayoutSessionActions";
import { buildChatSuggestionsRefreshKey } from "@/services/chat/chatSuggestionRefreshKey";
import type { ChatSessionSummary } from "@/services/chat/chatUiUtils";
import type { ChatLayoutState } from "@/components/chat/chatLayoutTypes";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Menu, PanelRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const POLL_MS = 2000;

export function ChatLayout({
  chatSessionId,
}: Readonly<{ chatSessionId: string }>) {
  const messagePages = useChatMessagePages(chatSessionId);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [state, setState] = useState<ChatLayoutState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);
  const [renderedChatSessionId, setRenderedChatSessionId] =
    useState(chatSessionId);
  const [optimisticMessages, setOptimisticMessages] = useState<
    OptimisticChatMessage[]
  >([]);
  const conversationRef = useRef<HTMLDivElement>(null);
  const scrollToBottomRef = useRef<(() => void) | null>(null);
  const [showScrollToBottomFab, setShowScrollToBottomFab] = useState(false);
  const lastMessageCountRef = useRef(0);

  if (chatSessionId !== renderedChatSessionId) {
    setRenderedChatSessionId(chatSessionId);
    setOptimisticMessages([]);
    setShowScrollToBottomFab(false);
  }

  const handleAtBottomChange = useCallback((atBottom: boolean) => {
    setShowScrollToBottomFab((current) => {
      const next = !atBottom;
      return current === next ? current : next;
    });
  }, []);

  const bindScrollToBottom = useCallback((scrollToBottom: () => void) => {
    scrollToBottomRef.current = scrollToBottom;
  }, []);

  useChatEntrance(conversationRef, "[data-chat-welcome], [data-chat-message]", [
    chatSessionId,
    messagePages.messages.length,
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
    const payload = (await response.json()) as ChatLayoutState & {
      error?: string;
    };
    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to load chat");
    }
    setState(payload);
    return payload;
  }, [chatSessionId]);

  const prunedOptimisticMessages = useMemo(
    () =>
      pruneConfirmedOptimisticMessages(
        optimisticMessages,
        messagePages.messages,
      ),
    [optimisticMessages, messagePages.messages],
  );

  const visibleMessages = useMemo(
    () =>
      mergeOptimisticChatMessages(
        messagePages.messages,
        prunedOptimisticMessages,
      ),
    [messagePages.messages, prunedOptimisticMessages],
  );

  const pendingStoryRequestIds = useMemo(
    () => listStoryIdsAwaitingChatUpdate(visibleMessages),
    [visibleMessages],
  );

  const shouldPoll =
    state === null ||
    state.status === "initializing" ||
    state?.storyCreation?.isGenerating ||
    pendingStoryRequestIds.length > 0;

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
        const refreshedMessages = await messagePages.refreshLatestPage();
        if (shouldScheduleChatPoll(payload, refreshedMessages)) {
          timer = setTimeout(poll, POLL_MS);
        }
      } catch (pollError) {
        if (!cancelled) {
          setError(
            pollError instanceof Error
              ? pollError.message
              : "Failed to load chat",
          );
          timer = setTimeout(poll, POLL_MS);
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
  }, [loadState, loadSessions, chatSessionId, shouldPoll, messagePages.refreshLatestPage]);

  useEffect(() => {
    lastMessageCountRef.current = 0;
  }, [chatSessionId]);

  useEffect(() => {
    const count = messagePages.messages.length;
    if (count > lastMessageCountRef.current && conversationRef.current) {
      const nodes = conversationRef.current.querySelectorAll("[data-chat-message]");
      const last = nodes[nodes.length - 1] as HTMLElement | undefined;
      animateNewMessage(last ?? null);
    }
    lastMessageCountRef.current = count;
  }, [messagePages.messages.length]);

  const title = state?.chatSession.title ?? "Chat";

  const suggestionsRefreshKey = useMemo(
    () => buildChatSuggestionsRefreshKey(visibleMessages),
    [visibleMessages],
  );

  const uiSuggestions = useChatUiSuggestions(
    chatSessionId,
    suggestionsRefreshKey,
  );

  const potentialStoryTopicsFetchKey = getPotentialStoryTopicsFetchKey({
    status: state?.status,
    storyCreation: state?.storyCreation,
    visibleMessages,
    suggestionsRefreshKey,
  });

  const potentialStoryTopicsState = usePotentialStoryTopicPages(
    chatSessionId,
    potentialStoryTopicsFetchKey,
  );

  const messageResearchBlocking = isMessageResearchBlockingChat({
    status: state?.status,
    storyCreation: state?.storyCreation,
    visibleMessages,
  });

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
        visibleMessages.length,
      ].join(":"),
    [state?.storyCreation, visibleMessages.length],
  );

  const composerDisabled = state == null || messageResearchBlocking;

  const composerPlaceholder = getComposerPlaceholder(
    state != null,
    messageResearchBlocking,
    visibleMessages.length,
  );

  const {
    sendMessage,
    handlePrompt,
    navigateToSession,
    handleNewChat,
    handleBookmarkChat,
    handleRenameChat,
    handleDeleteChat,
  } = useChatLayoutSessionActions({
    chatSessionId,
    activeSessionTitle: state?.chatSession.title ?? null,
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
    refreshLatestPage: messagePages.refreshLatestPage,
  });

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
      potentialTopicsLoading={potentialStoryTopicsState.isLoadingInitial}
      potentialTopicsHasMore={potentialStoryTopicsState.hasMore}
      potentialTopicsLoadingMore={potentialStoryTopicsState.loadingMore}
      potentialTopicsLoadMoreError={potentialStoryTopicsState.loadMoreError}
      onLoadMorePotentialTopics={() => {
        void potentialStoryTopicsState.loadMoreTopics();
      }}
      onRetryLoadMorePotentialTopics={() => {
        void potentialStoryTopicsState.retryLoadMore();
      }}
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
            {messageResearchBlocking ? (
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
                  potentialTopicsLoading={
                    potentialStoryTopicsState.isLoadingInitial
                  }
                  potentialTopicsHasMore={potentialStoryTopicsState.hasMore}
                  potentialTopicsLoadingMore={
                    potentialStoryTopicsState.loadingMore
                  }
                  potentialTopicsLoadMoreError={
                    potentialStoryTopicsState.loadMoreError
                  }
                  onLoadMorePotentialTopics={() => {
                    void potentialStoryTopicsState.loadMoreTopics();
                  }}
                  onRetryLoadMorePotentialTopics={() => {
                    void potentialStoryTopicsState.retryLoadMore();
                  }}
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

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
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
                scrollRef={conversationRef}
                loadingInitial={messagePages.loadingInitial}
                loadingOlder={messagePages.loadingOlder}
                hasMoreOlder={messagePages.hasMoreOlder}
                olderError={messagePages.olderError}
                onLoadOlder={() => void messagePages.loadOlderMessages()}
                onRetryOlder={() => void messagePages.retryLoadOlder()}
                sessionScrollKey={chatSessionId}
                onAtBottomChange={handleAtBottomChange}
                bindScrollToBottom={bindScrollToBottom}
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

          <ChatScrollToBottomFab
            visible={
              Boolean(state) &&
              !showWelcome &&
              visibleMessages.length > 0 &&
              showScrollToBottomFab
            }
            className="bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
            onClick={() => scrollToBottomRef.current?.()}
          />
        </div>

        {state ? (
          <ChatComposer
            value={draft}
            onChange={setDraft}
            onSend={() => void sendMessage(draft)}
            disabled={composerDisabled}
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
