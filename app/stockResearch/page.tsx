import { ResearchPlaceholder } from "@/components/research/ResearchPlaceholder";
import { requireProSubscriber } from "@/lib/requireProSubscriber";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stock research — Newsly",
  description: "Pro stock research workspace.",
};

export default async function StockResearchPage() {
  await requireProSubscriber();

  return (
    <ResearchPlaceholder
      title="Stock research"
      description="Deep equity research tools will live here. This page is a placeholder for Pro subscribers."
    />
  );
}
