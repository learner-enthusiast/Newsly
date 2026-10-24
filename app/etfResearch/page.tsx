import { StockResearchWorkspace } from "@/components/research/StockResearchWorkspace";
import { requireProSubscriber } from "@/lib/requireProSubscriber";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ETF research — Newsly",
  description: "Pro ETF research workspace.",
};

export default async function ResearchPage() {
  await requireProSubscriber();

  return <StockResearchWorkspace assetType="ETF" />;
}
