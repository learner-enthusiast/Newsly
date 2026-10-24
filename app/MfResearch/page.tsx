import { StockResearchWorkspace } from "@/components/research/StockResearchWorkspace";
import { requireProSubscriber } from "@/lib/requireProSubscriber";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mutual fund research — Newsly",
  description: "Pro Mutual fund research workspace.",
};

export default async function ResearchPage() {
  await requireProSubscriber();

  return <StockResearchWorkspace assetType="MUTUAL_FUND" />;
}
