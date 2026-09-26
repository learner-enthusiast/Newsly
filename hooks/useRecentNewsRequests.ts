"use client";

import type { SerializedNewsRequest } from "@/services/news/newsRequestTypes";
import { useEffect, useState } from "react";

export function useRecentNewsRequests(enabled = true) {
  const [recentRequests, setRecentRequests] = useState<SerializedNewsRequest[]>(
    [],
  );
  const [recentLoading, setRecentLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    async function loadRecent() {
      setRecentLoading(true);
      try {
        const response = await fetch("/api/news", { cache: "no-store" });
        const payload = (await response.json()) as {
          newsRequests?: SerializedNewsRequest[];
        };
        if (!cancelled && response.ok) {
          setRecentRequests(payload.newsRequests ?? []);
        }
      } finally {
        if (!cancelled) {
          setRecentLoading(false);
        }
      }
    }

    void loadRecent();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled) {
    return { recentRequests: [], recentLoading: false };
  }

  return { recentRequests, recentLoading };
}
