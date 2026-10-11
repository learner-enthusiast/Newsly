import { StockResearchHistoryView } from "@/components/research/StockResearchHistoryView";
import { requireProSubscriber } from "@/lib/requireProSubscriber";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ETF research history — Dainik Samachar",
  description: "All your ETF research reports.",
};

export default async function ResearchHistoryPage() {
  await requireProSubscriber();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <StockResearchHistoryView assetType="ETF" />
    </div>
  );
}
