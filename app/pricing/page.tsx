import { PricingPageContent } from "@/components/billing/PricingPageContent";
import { StaticMarketingPage } from "@/components/marketing/StaticMarketingPage";
import { getAuthenticatedUser } from "@/lib/auth";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — Newsly",
  description: "Free and Pro plans for Newsly research and briefings.",
};

export default async function PricingPage() {
  const user = await getAuthenticatedUser();

  return (
    <StaticMarketingPage
      eyebrow="Plans"
      title="Free to start. Pro when you need more."
      lead="News generation takes research time — Pro unlocks extended workflows while you keep the same source-backed briefings and chat."
      className="max-w-4xl"
    >
      <PricingPageContent initialPlan={user?.plan ?? null} />
    </StaticMarketingPage>
  );
}
