"use client";

import { Button } from "@/components/ui/button";
import {
  POTENTIAL_STORY_TOPICS_LOAD_MORE_SCROLL_THRESHOLD_PX,
  type SerializedPotentialStoryTopic,
} from "@/services/chat/potentialStoryTopicsPagination";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

type ChatPromptOptions = { shouldCreateStory?: boolean };

type VirtualizedPotentialStoryTopicsListProps = {
  topics: SerializedPotentialStoryTopic[];
  disabled?: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: string | null;
  onLoadMore: () => void;
  onRetryLoadMore: () => void;
  onPrompt: (prompt: string, options?: ChatPromptOptions) => void;
};

export function VirtualizedPotentialStoryTopicsList({
  topics,
  disabled,
  hasMore,
  loadingMore,
  loadMoreError,
  onLoadMore,
  onRetryLoadMore,
  onPrompt,
}: VirtualizedPotentialStoryTopicsListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadMoreRequestedRef = useRef(false);

  const virtualizer = useVirtualizer({
    count: topics.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 52,
    overscan: 6,
    getItemKey: (index) =>
      topics[index]
        ? `${topics[index]!.absoluteIndex}-${topics[index]!.topic}`
        : index,
  });

  useEffect(() => {
    if (!loadingMore && loadMoreRequestedRef.current) {
      loadMoreRequestedRef.current = false;
    }
  }, [loadingMore]);

  const checkScrollForMore = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    if (
      distanceFromBottom <= POTENTIAL_STORY_TOPICS_LOAD_MORE_SCROLL_THRESHOLD_PX &&
      hasMore &&
      !loadingMore &&
      !loadMoreRequestedRef.current &&
      !loadMoreError
    ) {
      loadMoreRequestedRef.current = true;
      onLoadMore();
    }
  }, [hasMore, loadingMore, loadMoreError, onLoadMore]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(checkScrollForMore);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
    };
  }, [checkScrollForMore]);

  return (
    <div className="flex flex-col gap-1">
      <div
        ref={scrollRef}
        className="max-h-[15rem] overflow-y-auto overscroll-y-contain pr-0.5"
        aria-label="Potential story topics list"
      >
        <ol
          className="relative w-full text-sm"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = topics[virtualRow.index];
            if (!item) {
              return null;
            }
            return (
              <li
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className="absolute top-0 left-0 w-full"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto w-full justify-start gap-2 whitespace-normal py-1.5 text-left font-normal"
                  disabled={disabled}
                  onClick={() =>
                    onPrompt(`Create a story about: ${item.topic}`, {
                      shouldCreateStory: true,
                    })
                  }
                >
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {item.absoluteIndex + 1}
                  </span>
                  <span>{item.topic}</span>
                </Button>
              </li>
            );
          })}
        </ol>

        {loadingMore ? (
          <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Loading more…
          </div>
        ) : null}
      </div>

      {loadMoreError ? (
        <div className="text-center">
          <p className="text-xs text-muted-foreground">{loadMoreError}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto py-1 text-xs"
            onClick={() => void onRetryLoadMore()}
          >
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}
