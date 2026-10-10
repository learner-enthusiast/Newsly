"use client";

import {
  mergePotentialStoryTopicPages,
  POTENTIAL_STORY_TOPICS_PAGE_SIZE,
  type PotentialStoryTopicsPageResponse,
  type SerializedPotentialStoryTopic,
} from "@/services/chat/potentialStoryTopicsPagination";
import { useCallback, useEffect, useRef, useState } from "react";

const FETCH_DELAY_MS = 5_000;

type UsePotentialStoryTopicPagesResult = {
  topics: SerializedPotentialStoryTopic[];
  isLoadingInitial: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMoreError: string | null;
  loadMoreTopics: () => Promise<void>;
  retryLoadMore: () => Promise<void>;
  refreshFirstPage: () => Promise<void>;
};

async function fetchTopicsPage(
  chatSessionId: string,
  offset: number,
  signal?: AbortSignal,
): Promise<PotentialStoryTopicsPageResponse> {
  const params = new URLSearchParams({
    limit: String(POTENTIAL_STORY_TOPICS_PAGE_SIZE),
    offset: String(offset),
  });
  const response = await fetch(
    `/api/chat/${chatSessionId}/potential-stories?${params.toString()}`,
    { cache: "no-store", signal },
  );

  let payload: PotentialStoryTopicsPageResponse & { error?: string };
  try {
    payload = (await response.json()) as PotentialStoryTopicsPageResponse & {
      error?: string;
    };
  } catch {
    throw new Error("Could not load story topics");
  }

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not load story topics");
  }
  if (!Array.isArray(payload.topics)) {
    throw new Error("Could not load story topics");
  }

  return payload;
}

export function usePotentialStoryTopicPages(
  chatSessionId: string,
  agentSuccessKey: string | null,
): UsePotentialStoryTopicPagesResult {
  const [topics, setTopics] = useState<SerializedPotentialStoryTopic[]>([]);
  const [isLoadingInitial, setIsLoadingInitial] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const nextOffsetRef = useRef<number | null>(null);
  const loadMoreInFlightRef = useRef(false);
  const sessionKeyRef = useRef(`${chatSessionId}:${agentSuccessKey ?? ""}`);

  const applyFirstPage = useCallback((page: PotentialStoryTopicsPageResponse) => {
    nextOffsetRef.current = page.nextOffset;
    setTopics(page.topics);
    setHasMore(page.hasMore);
    setIsLoadingInitial(false);
    setLoadingMore(false);
    setLoadMoreError(null);
  }, []);

  useEffect(() => {
    const sessionKey = `${chatSessionId}:${agentSuccessKey ?? ""}`;
    if (sessionKeyRef.current !== sessionKey) {
      sessionKeyRef.current = sessionKey;
      setTopics([]);
      setHasMore(false);
      setLoadMoreError(null);
      nextOffsetRef.current = null;
    }

    if (!agentSuccessKey) {
      setIsLoadingInitial(false);
      return;
    }

    let cancelled = false;
    setIsLoadingInitial(true);
    setLoadMoreError(null);
    nextOffsetRef.current = null;

    const timer = window.setTimeout(() => {
      void fetchTopicsPage(chatSessionId, 0)
        .then((page) => {
          if (!cancelled) {
            applyFirstPage(page);
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setTopics([]);
            setHasMore(false);
            setIsLoadingInitial(false);
            setLoadMoreError(
              error instanceof Error
                ? error.message
                : "Could not load story topics",
            );
          }
        });
    }, FETCH_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [chatSessionId, agentSuccessKey, applyFirstPage]);

  const refreshFirstPage = useCallback(async () => {
    if (!agentSuccessKey) {
      return;
    }
    try {
      const page = await fetchTopicsPage(chatSessionId, 0);
      setTopics((current) => mergePotentialStoryTopicPages(current, page.topics));
      if (nextOffsetRef.current === null) {
        nextOffsetRef.current = page.nextOffset;
        setHasMore(page.hasMore);
      }
    } catch {
      /* best-effort */
    }
  }, [agentSuccessKey, chatSessionId]);

  const loadMoreTopics = useCallback(
    async (options?: { force?: boolean }) => {
      if (!agentSuccessKey || (loadMoreInFlightRef.current && !options?.force)) {
        return;
      }

      const offset = nextOffsetRef.current;
      if (offset === null) {
        if (options?.force) {
          setLoadMoreError("Nothing more to load.");
        }
        return;
      }

      loadMoreInFlightRef.current = true;
      setLoadingMore(true);
      setLoadMoreError(null);

      try {
        const page = await fetchTopicsPage(chatSessionId, offset);
        nextOffsetRef.current = page.nextOffset;
        setTopics((current) => mergePotentialStoryTopicPages(current, page.topics));
        setHasMore(page.hasMore);
      } catch (error) {
        setLoadMoreError(
          error instanceof Error
            ? error.message
            : "Could not load more story topics",
        );
      } finally {
        loadMoreInFlightRef.current = false;
        setLoadingMore(false);
      }
    },
    [agentSuccessKey, chatSessionId],
  );

  const retryLoadMore = useCallback(async () => {
    await loadMoreTopics({ force: true });
  }, [loadMoreTopics]);

  return {
    topics,
    isLoadingInitial,
    loadingMore,
    hasMore,
    loadMoreError,
    loadMoreTopics: () => loadMoreTopics(),
    retryLoadMore,
    refreshFirstPage,
  };
}
