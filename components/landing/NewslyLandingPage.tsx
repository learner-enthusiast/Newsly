import { AboutMotion } from "@/components/about/AboutMotion.client";
import { ArchitectureSection } from "@/components/about/ArchitectureSection";
import { NewsPipelineSection } from "@/components/about/NewsPipelineSection";
import { NoiseToSignal } from "@/components/about/NoiseToSignal";
import { ProblemSection } from "@/components/about/ProblemSection";
import { AskSection } from "@/components/landing/AskSection";
import { BrowseToUnderstand } from "@/components/landing/BrowseToUnderstand";
import { ChatToStory } from "@/components/landing/ChatToStory";
import { ConversationalResearch } from "@/components/landing/ConversationalResearch";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { HeadlineContext } from "@/components/landing/HeadlineContext";
import { HeroSection } from "@/components/landing/HeroSection";
import { LandingStoryMotion } from "@/components/landing/LandingStoryMotion.client";
import { PhilosophySection } from "@/components/landing/PhilosophySection";
import { PricingSection } from "@/components/landing/PricingSection";
import { SourceTrail } from "@/components/landing/SourceTrail";
import { TrendingSection } from "@/components/landing/TrendingSection";

export function NewslyLandingPage() {
  return (
    <main
      data-landing-page
      className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-background text-foreground"
    >
      <LandingStoryMotion />
      <AboutMotion />
      <HeroSection />

      <HeadlineContext />
      <ProblemSection />
      <NoiseToSignal />
      <ArchitectureSection />
      <NewsPipelineSection />
      <ConversationalResearch />
      <AskSection />
      <ChatToStory />
      <SourceTrail />
      <BrowseToUnderstand />
      <TrendingSection />
      <PhilosophySection />
      <PricingSection />
      <FinalCTA />
    </main>
  );
}
