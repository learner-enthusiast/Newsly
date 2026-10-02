"use client";

import { AssistantMessage } from "@/components/chat/AssistantMessage";
import { UserMessage } from "@/components/chat/UserMessage";
import { isOptimisticMessageId } from "@/services/chat/chatOptimisticUi";
import { CHAT_LOAD_OLDER_SCROLL_THRESHOLD_PX } from "@/services/chat/chatMessagePagination";
import type { SerializedChatMessageListItem } from "@/services/chat/chatMessagePagination";
import { deriveStoryCreationPayloadForMessage } from "@/services/chat/chatStoryRequestMessage";
import { isAssistantRole } from "@/services/chat/chatUiUtils";
import type { ChatStoryCreationPayload } from "@/services/news/newsRequestTypes";
import {
  prefersReducedMotion,
  scrollElementToBottom,
  type ScrollToBottomMode,
} from "@/components/chat/useChatMotion";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";

const MemoAssistantMessage = memo(AssistantMessage);
const MemoUserMessage = memo(UserMessage);

type ChatVirtualizedMessageListProps = {
  messages: SerializedChatMessageListItem[];
  scrollRef: React.RefObject<HTMLElement | null>;
  loadingInitial: boolean;
  loadingOlder: boolean;
  hasMoreOlder: boolean;
  olderError: string | null;
  onLoadOlder: () => void;
  onRetryOlder: () => void;
  footer?: ReactNode;
  header?: ReactNode;
  /** Changes when the active chat session changes (scroll-to-bottom on open). */
  sessionScrollKey?: string;
  onAtBottomChange?: (atBottom: boolean) => void;
  bindScrollToBottom?: (scrollToBottom: () => void) => void;
  storyCreation?: ChatStoryCreationPayload | null;
};

function MessageRow({
  message,
  storyCreation,
}: {
  message: SerializedChatMessageListItem;
  storyCreation?: ChatStoryCreationPayload | null;
}) {
  if (isAssistantRole(message.role)) {
    const inlineStoryCreation = deriveStoryCreationPayloadForMessage(
      message,
      storyCreation,
    );
    return (
      <MemoAssistantMessage
        content={message.content}
        createdAt={message.createdAt}
        storyCreation={inlineStoryCreation}
      />
    );
  }
  return (
    <MemoUserMessage
      content={message.content}
      createdAt={message.createdAt}
      pending={isOptimisticMessageId(message.id)}
    />
  );
}

const MemoMessageRow = memo(MessageRow);

export function ChatVirtualizedMessageList({
  messages,
  scrollRef,
  loadingInitial,
  loadingOlder,
  hasMoreOlder,
  olderError,
  onLoadOlder,
  onRetryOlder,
  footer,
  header,
  sessionScrollKey,
  onAtBottomChange,
  bindScrollToBottom,
  storyCreation,
}: ChatVirtualizedMessageListProps) {
  const prependAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(
    null,
  );
  const loadOlderRequestedRef = useRef(false);
  const isAtBottomRef = useRef(true);
  const previousMessageCountRef = useRef(messages.length);
  const initialScrollDoneForSessionRef = useRef<string | null>(null);
  const pendingInitialBottomSnapRef = useRef(false);
  const atBottomStateRef = useRef(true);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 128,
    overscan: 10,
    getItemKey: (index) => messages[index]?.id ?? index,
  });

  const checkScrollPosition = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < 120;
    isAtBottomRef.current = atBottom;
    if (atBottomStateRef.current !== atBottom) {
      atBottomStateRef.current = atBottom;
      onAtBottomChange?.(atBottom);
    }
    if (atBottom) {
      pendingInitialBottomSnapRef.current = false;
    }
  }, [scrollRef, onAtBottomChange]);

  const smoothScrollFinishTimeoutRef = useRef<number | null>(null);

  const snapScrollContainerToBottom = useCallback(
    (options?: { mode?: ScrollToBottomMode }) => {
      const el = scrollRef.current;
      if (!el) {
        return;
      }

      const mode = options?.mode ?? "instant";
      const behavior =
        mode === "smooth" && !prefersReducedMotion() ? "smooth" : "auto";

      if (smoothScrollFinishTimeoutRef.current != null) {
        window.clearTimeout(smoothScrollFinishTimeoutRef.current);
        smoothScrollFinishTimeoutRef.current = null;
      }

      if (messages.length > 0) {
        virtualizer.scrollToIndex(messages.length - 1, {
          align: "end",
          behavior,
        });
      }

      scrollElementToBottom(el, mode);

      if (behavior === "auto") {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
          requestAnimationFrame(() => {
            el.scrollTop = el.scrollHeight;
          });
        });
        return;
      }

      smoothScrollFinishTimeoutRef.current = window.setTimeout(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
        checkScrollPosition();
        smoothScrollFinishTimeoutRef.current = null;
      }, 480);
    },
    [messages.length, scrollRef, virtualizer, checkScrollPosition],
  );

  useLayoutEffect(() => {
    if (!prependAnchorRef.current || !scrollRef.current) {
      return;
    }
    const el = scrollRef.current;
    const anchor = prependAnchorRef.current;
    const delta = el.scrollHeight - anchor.scrollHeight;
    el.scrollTop = anchor.scrollTop + delta;
    prependAnchorRef.current = null;
  }, [messages.length, scrollRef]);

  useEffect(() => {
    if (!loadingOlder && loadOlderRequestedRef.current) {
      loadOlderRequestedRef.current = false;
    }
  }, [loadingOlder]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        checkScrollPosition();
        if (
          el.scrollTop <= CHAT_LOAD_OLDER_SCROLL_THRESHOLD_PX &&
          hasMoreOlder &&
          !loadingOlder &&
          !loadOlderRequestedRef.current &&
          !olderError
        ) {
          loadOlderRequestedRef.current = true;
          prependAnchorRef.current = {
            scrollHeight: el.scrollHeight,
            scrollTop: el.scrollTop,
          };
          onLoadOlder();
        }
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    checkScrollPosition();
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
    };
  }, [
    scrollRef,
    hasMoreOlder,
    loadingOlder,
    olderError,
    onLoadOlder,
    checkScrollPosition,
  ]);

  useEffect(() => {
    if (messages.length === 0 || loadingOlder) {
      return;
    }
    if (!isAtBottomRef.current) {
      return;
    }
    const previousCount = previousMessageCountRef.current;
    const mode: ScrollToBottomMode =
      messages.length > previousCount ? "smooth" : "instant";
    previousMessageCountRef.current = messages.length;
    snapScrollContainerToBottom({ mode });
  }, [messages, loadingOlder, snapScrollContainerToBottom]);

  useEffect(
    () => () => {
      if (smoothScrollFinishTimeoutRef.current != null) {
        window.clearTimeout(smoothScrollFinishTimeoutRef.current);
      }
    },
    [],
  );

  const scrollToBottom = useCallback(() => {
    snapScrollContainerToBottom({ mode: "smooth" });
    isAtBottomRef.current = true;
    atBottomStateRef.current = true;
    onAtBottomChange?.(true);
  }, [snapScrollContainerToBottom, onAtBottomChange]);

  useEffect(() => {
    bindScrollToBottom?.(scrollToBottom);
  }, [bindScrollToBottom, scrollToBottom]);

  useLayoutEffect(() => {
    previousMessageCountRef.current = 0;
    isAtBottomRef.current = true;
    initialScrollDoneForSessionRef.current = null;
    pendingInitialBottomSnapRef.current = true;
    onAtBottomChange?.(true);
  }, [sessionScrollKey, onAtBottomChange]);

  useLayoutEffect(() => {
    if (
      loadingInitial ||
      messages.length === 0 ||
      !sessionScrollKey ||
      initialScrollDoneForSessionRef.current === sessionScrollKey
    ) {
      return;
    }
    initialScrollDoneForSessionRef.current = sessionScrollKey;
    pendingInitialBottomSnapRef.current = true;
    isAtBottomRef.current = true;
    previousMessageCountRef.current = messages.length;
    snapScrollContainerToBottom({ mode: "instant" });
    onAtBottomChange?.(true);
  }, [
    sessionScrollKey,
    loadingInitial,
    messages.length,
    snapScrollContainerToBottom,
    onAtBottomChange,
  ]);

  useEffect(() => {
    const el = scrollRef.current;
    const content = el?.querySelector("[data-chat-scroll-content]");
    if (!el || !content || !pendingInitialBottomSnapRef.current) {
      return;
    }

    const snap = () => {
      if (pendingInitialBottomSnapRef.current) {
        snapScrollContainerToBottom({ mode: "instant" });
      }
    };

    const observer = new ResizeObserver(snap);
    observer.observe(content);
    snap();

    const timeout = window.setTimeout(() => {
      pendingInitialBottomSnapRef.current = false;
      snap();
      checkScrollPosition();
    }, 1500);

    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };
  }, [
    sessionScrollKey,
    loadingInitial,
    messages.length,
    scrollRef,
    snapScrollContainerToBottom,
    checkScrollPosition,
  ]);

  if (loadingInitial && messages.length === 0) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      data-chat-scroll-content
      className="relative mx-auto w-full max-w-3xl px-4 py-6"
    >
      {header}

      <div className="sticky top-0 z-10 flex min-h-8 flex-col items-center justify-center gap-1 bg-gradient-to-b from-background via-background/95 to-transparent pb-2">
        {loadingOlder ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Loading older messages…
          </p>
        ) : null}
        {olderError ? (
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
            <span>Couldn&apos;t load older messages.</span>
            <button
              type="button"
              className="font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
              disabled={loadingOlder}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onRetryOlder();
              }}
            >
              {loadingOlder ? "Retrying…" : "Retry"}
            </button>
          </div>
        ) : null}
        {!hasMoreOlder && messages.length > 0 && !loadingOlder ? (
          <p className="text-[11px] text-muted-foreground">Start of conversation</p>
        ) : null}
      </div>

      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const message = messages[virtualRow.index];
          if (!message) {
            return null;
          }
          return (
            <div
              key={message.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full pb-4"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <MemoMessageRow message={message} storyCreation={storyCreation} />
            </div>
          );
        })}
      </div>

      {footer}
    </div>
  );
}
