"use client";

import {
  NEWS_STORY_POLL_MS,
  shouldPollNewsStoryStatus,
} from "@/services/news/newsStoryPollingLogic";
import type { NewsStoryPagePayload } from "@/services/news/newsRequestTypes";
import { useCallback, useEffect, useState } from "react";

async function fetchNewsStoryPage(
  storyId: string,
  signal?: AbortSignal,
): Promise<NewsStoryPagePayload> {
  const response = await fetch(`/api/news/stories/${storyId}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  const payload = (await response.json()) as NewsStoryPagePayload & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to load story");
  }

  return payload;
}

export function useNewsStoryPolling(storyId: string | undefined) {
  const [data, setData] = useState<NewsStoryPagePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollWarning, setPollWarning] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!storyId) {
      return null;
    }
    const payload = await fetchNewsStoryPage(storyId);
    setData(payload);
    setError(null);
    return payload;
  }, [storyId]);

  useEffect(() => {
    if (!storyId) {
      return;
    }
    const activeStoryId = storyId;

    const abortController = new AbortController();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      if (cancelled) {
        return;
      }
      try {
        const payload = await fetchNewsStoryPage(
          activeStoryId,
          abortController.signal,
        );
        if (cancelled) {
          return;
        }
        setPollWarning(null);
        setError(null);
        setData(payload);
        if (shouldPollNewsStoryStatus(payload.story.status)) {
          timer = setTimeout(poll, NEWS_STORY_POLL_MS);
        }
      } catch (pollError) {
        if (cancelled) {
          return;
        }
        if (
          pollError instanceof DOMException &&
          pollError.name === "AbortError"
        ) {
          return;
        }
        const message =
          pollError instanceof Error ? pollError.message : "Polling failed";
        setPollWarning("Connection issue — still checking your story…");
        timer = setTimeout(poll, NEWS_STORY_POLL_MS);
      }
    }

    void poll();

    return () => {
      cancelled = true;
      abortController.abort();
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [storyId]);

  return {
    data,
    setData,
    error,
    pollWarning,
    refresh,
    isLoading: Boolean(storyId) && data === null && error === null,
    isPending: data?.story.status === "PENDING",
  };
}
