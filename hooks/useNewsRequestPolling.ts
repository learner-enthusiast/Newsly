"use client";

import {
  isFatalPollError,
  shouldScheduleNextPoll,
} from "@/services/news/newsRequestPollingLogic";
import type { NewsRequestResultPayload } from "@/services/news/newsRequestTypes";
import { useCallback, useEffect, useState } from "react";

export const NEWS_REQUEST_POLL_MS = 3000;

function normalizePollPayload(
  raw: NewsRequestResultPayload & { error?: string },
): NewsRequestResultPayload {
  return {
    newsRequest: raw.newsRequest,
    stories: Array.isArray(raw.stories) ? raw.stories : [],
  };
}

async function fetchNewsRequestResult(
  newsRequestId: string,
  signal?: AbortSignal,
): Promise<NewsRequestResultPayload> {
  const response = await fetch(`/api/news/${newsRequestId}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  const payload = (await response.json()) as NewsRequestResultPayload & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to load news request");
  }

  return normalizePollPayload(payload);
}

export function useNewsRequestPolling(newsRequestId: string | undefined) {
  const [data, setData] = useState<NewsRequestResultPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollWarning, setPollWarning] = useState<string | null>(null);
  const [pollEpoch, setPollEpoch] = useState(0);

  const refresh = useCallback(async () => {
    if (!newsRequestId) {
      return null;
    }
    const payload = await fetchNewsRequestResult(newsRequestId);
    setData(payload);
    setError(null);
    return payload;
  }, [newsRequestId]);

  const restartPolling = useCallback(() => {
    setError(null);
    setPollWarning(null);
    setPollEpoch((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!newsRequestId) {
      return;
    }
    const requestId: string = newsRequestId;

    const abortController = new AbortController();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      if (cancelled) {
        return;
      }
      try {
        const payload = await fetchNewsRequestResult(
          requestId,
          abortController.signal,
        );
        if (cancelled) {
          return;
        }
        setPollWarning(null);
        setError(null);
        setData(payload);
        if (shouldScheduleNextPoll(payload.newsRequest.status)) {
          timer = setTimeout(poll, NEWS_REQUEST_POLL_MS);
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
        if (isFatalPollError(message)) {
          setError(message);
          return;
        }
        setPollWarning(
          "Connection issue — still checking your request in the background…",
        );
        timer = setTimeout(poll, NEWS_REQUEST_POLL_MS);
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
  }, [newsRequestId, pollEpoch]);

  const status = data?.newsRequest.status;

  return {
    data,
    setData,
    error,
    pollWarning,
    refresh,
    restartPolling,
    /** True until the first successful GET for this id (or a fatal error). */
    isLoading: Boolean(newsRequestId) && data === null && error === null,
    isPending: status === "pending",
    isSuccess: status === "success",
    isFailed: status === "failed",
  };
}
