import { StockResearchResultClient } from "@/components/research/StockResearchResultClient";
import { requireProSubscriber } from "@/lib/requireProSubscriber";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ETF research report — Dainik Samachar",
  description: "Pro ETF research report.",
};

export default async function ResearchResultPage({
  params,
}: {
  params: Promise<{ stockResearchId: string }>;
}) {
  await requireProSubscriber();
  const { stockResearchId } = await params;

  return <StockResearchResultClient researchId={stockResearchId} />;
}
