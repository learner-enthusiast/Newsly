"use client";

import {
  STOCK_RESEARCHES_SIDEBAR_LIMIT,
  type ResearchAssetType,
  type SerializedStockResearch,
  type StockResearchListPayload,
} from "@/services/stockResearch/stockResearchTypes";
import { useEffect, useState } from "react";

/** Latest few researches for the sidebar. Bump `refreshKey` to refetch. */
export function useRecentStockResearches(
  limit = STOCK_RESEARCHES_SIDEBAR_LIMIT,
  refreshKey: unknown = null,
  assetType?: ResearchAssetType,
) {
  const [recentResearches, setRecentResearches] = useState<
    SerializedStockResearch[]
  >([]);
  const [total, setTotal] = useState(0);
  const [recentLoading, setRecentLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const params = new URLSearchParams({ page: "1", limit: String(limit) });
        if (assetType) {
          params.set("assetType", assetType);
        }
        const response = await fetch(`/api/stockResearch?${params}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as StockResearchListPayload;
        if (!cancelled && response.ok) {
          setRecentResearches(payload.stockResearches);
          setTotal(payload.total);
        }
      } catch {
        // Sidebar is best-effort; keep the last list.
      } finally {
        if (!cancelled) {
          setRecentLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [assetType, limit, refreshKey]);

  return { recentResearches, total, recentLoading };
}
