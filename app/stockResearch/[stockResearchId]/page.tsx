import { StockResearchResultClient } from "@/components/research/StockResearchResultClient";
import { requireProSubscriber } from "@/lib/requireProSubscriber";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stock research report — Newsly",
  description: "Pro stock research report.",
};

export default async function StockResearchResultPage({
  params,
}: {
  params: Promise<{ stockResearchId: string }>;
}) {
  await requireProSubscriber();
  const { stockResearchId } = await params;

  return <StockResearchResultClient researchId={stockResearchId} />;
}
