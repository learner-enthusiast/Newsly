import { ResearchPlaceholder } from "@/components/research/ResearchPlaceholder";
import { requireProSubscriber } from "@/lib/requireProSubscriber";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MF research — Newsly",
  description: "Pro mutual fund research workspace.",
};

export default async function MfResearchPage() {
  await requireProSubscriber();

  return (
    <ResearchPlaceholder
      title="MF research"
      description="Mutual fund research tools will live here. This page is a placeholder for Pro subscribers."
    />
  );
}
