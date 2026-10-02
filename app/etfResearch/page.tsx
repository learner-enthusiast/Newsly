import { ResearchPlaceholder } from "@/components/research/ResearchPlaceholder";
import { requireProSubscriber } from "@/lib/requireProSubscriber";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ETF research — Newsly",
  description: "Pro ETF research workspace.",
};

export default async function EtfResearchPage() {
  await requireProSubscriber();

  return (
    <ResearchPlaceholder
      title="ETF research"
      description="ETF research tools will live here. This page is a placeholder for Pro subscribers."
    />
  );
}
