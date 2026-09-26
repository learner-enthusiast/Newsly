import { FeatureStrip } from "@/components/landing/FeatureStrip";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { HeroSection } from "@/components/landing/HeroSection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ProductDifference } from "@/components/landing/ProductDifference";
import { ProductJourney } from "@/components/landing/ProductJourney";
import { TrendingSection } from "@/components/landing/TrendingSection";

/** Signed-in home dashboard (marketing layout + live trending). */
export function NewslyDashboardPage() {
  return (
    <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-background">
      <HeroSection />
      <FeatureStrip />
      <TrendingSection />
      <HowItWorks />
      <ProductDifference />
      <ProductJourney />
      <FinalCTA />
    </main>
  );
}
