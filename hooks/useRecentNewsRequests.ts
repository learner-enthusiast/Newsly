"use client";

import type { SerializedNewsRequest } from "@/services/news/newsRequestTypes";
import { useEffect, useState } from "react";

export function useRecentNewsRequests() {
  const [recentRequests, setRecentRequests] = useState<SerializedNewsRequest[]>(
    [],
  );
  const [recentLoading, setRecentLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadRecent() {
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
  }, []);

  return { recentRequests, recentLoading };
}
