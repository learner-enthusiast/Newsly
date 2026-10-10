"use client";

import { StockResearchResultView } from "@/components/research/StockResearchResultView";
import { ShimmerLoadingStatus } from "@/components/ui/shimmer-loading-status";
import { useStockResearchPolling } from "@/hooks/useStockResearchPolling";

const STOCK_RESEARCH_LOADING_MESSAGES = [
  "Checking your research status…",
  "Syncing pipeline progress…",
  "Loading your report…",
] as const;

export function StockResearchResultClient({
  researchId,
}: {
  researchId: string;
}) {
  const { data, error, pollWarning, isLoading } =
    useStockResearchPolling(researchId);

  return (
    <>
      {isLoading ? (
        <ShimmerLoadingStatus
          messages={STOCK_RESEARCH_LOADING_MESSAGES}
          statusLabel="Loading stock research"
          className="min-h-[40vh]"
        />
      ) : null}
      {error ? (
        <p className="px-4 py-8 text-sm text-destructive">{error}</p>
      ) : null}
      {pollWarning ? (
        <p className="px-4 py-2 text-sm text-amber-800">{pollWarning}</p>
      ) : null}
      {data ? (
        <StockResearchResultView researchId={researchId} data={data} />
      ) : null}
    </>
  );
}
