"use client";

import { useEffect, useState } from "react";

const FETCH_DELAY_MS = 5_000;

type UsePotentialStoryTopicsResult = {
  topics: string[];
  isLoading: boolean;
};

/**
 * Fetches potential story topics once, 5s after `agentSuccessKey` is set
 * (ready chat + assistant reply). Pass `null` while the pipeline is still running.
 */
export function usePotentialStoryTopics(
  chatSessionId: string,
  agentSuccessKey: string | null,
): UsePotentialStoryTopicsResult {
  const [topicsBySession, setTopicsBySession] = useState<
    Record<string, string[]>
  >({});
  const [loadingSessions, setLoadingSessions] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    if (!agentSuccessKey) {
      return;
    }

    let cancelled = false;

    async function fetchTopics() {
      setLoadingSessions((current) => ({ ...current, [chatSessionId]: true }));
      try {
        const response = await fetch(
          `/api/chat/${chatSessionId}/potential-stories`,
          { cache: "no-store" },
        );
        if (!response.ok || cancelled) {
          return;
        }
        const payload = (await response.json()) as { topics?: string[] };
        if (Array.isArray(payload.topics) && !cancelled) {
          const topics = payload.topics;
          setTopicsBySession((current) => ({
            ...current,
            [chatSessionId]: topics,
          }));
        }
      } catch {
        // ignore network errors
      } finally {
        if (!cancelled) {
          setLoadingSessions((current) => ({
            ...current,
            [chatSessionId]: false,
          }));
        }
      }
    }

    const timer = setTimeout(() => {
      void fetchTopics();
    }, FETCH_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [chatSessionId, agentSuccessKey]);

  const topics = topicsBySession[chatSessionId] ?? [];

  return {
    topics,
    isLoading: loadingSessions[chatSessionId] === true,
  };
}
