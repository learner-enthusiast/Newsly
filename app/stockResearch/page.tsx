import { StockResearchWorkspace } from "@/components/research/StockResearchWorkspace";
import { requireProSubscriber } from "@/lib/requireProSubscriber";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stock research — Dainik Samachar",
  description: "Pro stock research workspace.",
};

export default async function StockResearchPage() {
  await requireProSubscriber();

  return <StockResearchWorkspace />;
}
