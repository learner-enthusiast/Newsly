import { AboutCtaSection } from "@/components/about/AboutCtaSection";
import { AboutHero } from "@/components/about/AboutHero";
import { AboutMotion } from "@/components/about/AboutMotion.client";
import { AboutPageShell } from "@/components/about/AboutPageShell";
import { ArchitectureSection } from "@/components/about/ArchitectureSection";
import { ChatPipelineSection } from "@/components/about/ChatPipelineSection";
import { EngineeringSection, LifecycleSection } from "@/components/about/EngineeringSection";
import { EvidenceSection } from "@/components/about/EvidenceSection";
import { NewsPipelineSection } from "@/components/about/NewsPipelineSection";
import { NoiseToSignal } from "@/components/about/NoiseToSignal";
import { ProblemSection } from "@/components/about/ProblemSection";
import { StoryFlowSection } from "@/components/about/StoryFlowSection";
import { VectorSection } from "@/components/about/VectorSection";
import type { Metadata } from "next";

const title = "How Newsly works — Newsly";
const description =
  "How Newsly turns web search, scraped sources, and session research into briefings, chat answers, and stories you can trust.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, type: "website" },
};

export default function AboutPage() {
  return (
    <AboutPageShell>
      <AboutMotion />
      <AboutHero />
      <ProblemSection />
      <NoiseToSignal />
      <ArchitectureSection />
      <NewsPipelineSection />
      <ChatPipelineSection />
      <StoryFlowSection />
      <EvidenceSection />
      <VectorSection />
      <EngineeringSection />
      <LifecycleSection />
      <AboutCtaSection />
    </AboutPageShell>
  );
}
