import { StockResearchHistoryView } from "@/components/research/StockResearchHistoryView";
import { requireProSubscriber } from "@/lib/requireProSubscriber";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stock research history — Newsly",
  description: "All your stock research reports.",
};

export default async function StockResearchHistoryPage() {
  await requireProSubscriber();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <StockResearchHistoryView />
    </div>
  );
}
