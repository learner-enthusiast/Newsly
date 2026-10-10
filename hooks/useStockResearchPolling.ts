"use client";

import {
  isStockResearchInProgress,
  STOCK_RESEARCH_POLL_MS,
  type StockResearchDetailPayload,
} from "@/services/stockResearch/stockResearchTypes";
import { useEffect, useState } from "react";

class FatalPollError extends Error {}

async function fetchStockResearch(
  id: string,
  signal: AbortSignal,
): Promise<StockResearchDetailPayload> {
  const response = await fetch(`/api/stockResearch/${id}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  const payload = (await response.json()) as StockResearchDetailPayload & {
    error?: string;
  };
  if (!response.ok) {
    const message = payload.error ?? "Failed to load stock research";
    // Not found / no access will not fix itself — stop polling.
    if (response.status >= 400 && response.status < 500) {
      throw new FatalPollError(message);
    }
    throw new Error(message);
  }
  return payload;
}

/** Polls `/api/stockResearch/:id` every 3s until the research completes or fails. */
export function useStockResearchPolling(id: string | undefined) {
  const [data, setData] = useState<StockResearchDetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollWarning, setPollWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      return;
    }
    const researchId: string = id;
    const abortController = new AbortController();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      if (cancelled) {
        return;
      }
      try {
        const payload = await fetchStockResearch(
          researchId,
          abortController.signal,
        );
        if (cancelled) {
          return;
        }
        setData(payload);
        setError(null);
        setPollWarning(null);
        if (isStockResearchInProgress(payload.stockResearch.status)) {
          timer = setTimeout(poll, STOCK_RESEARCH_POLL_MS);
        }
      } catch (pollError) {
        if (
          cancelled ||
          (pollError instanceof DOMException && pollError.name === "AbortError")
        ) {
          return;
        }
        if (pollError instanceof FatalPollError) {
          setError(pollError.message);
          return;
        }
        setPollWarning(
          "Connection issue — still checking your research in the background…",
        );
        timer = setTimeout(poll, STOCK_RESEARCH_POLL_MS);
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
  }, [id]);

  return {
    data,
    error,
    pollWarning,
    isLoading: Boolean(id) && data === null && error === null,
  };
}
