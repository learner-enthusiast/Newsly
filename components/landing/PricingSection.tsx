import { PricingPageContent } from "@/components/billing/PricingPageContent";
import { LandingBlock, LandingEyebrow } from "@/components/landing/LandingBlock";
import Link from "next/link";

export function PricingSection() {
  return (
    <LandingBlock id="pricing">
      <LandingEyebrow>Plans</LandingEyebrow>
      <h2 className="font-display mt-5 max-w-2xl text-4xl leading-[1.05] font-normal tracking-tight text-balance sm:text-5xl">
        Free to start. Pro when research is your job.
      </h2>
      <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
        Briefings and chat stay source-backed on every plan. Pro adds extended research
        workflows — pay once per period via Razorpay when you&apos;re ready.
      </p>
      <div className="mt-10">
        <PricingPageContent initialPlan={null} />
      </div>
      <p className="mt-8 text-sm text-muted-foreground">
        Already signed in?{" "}
        <Link href="/pricing" className="font-medium text-foreground underline-offset-4 hover:underline">
          Open the full pricing page
        </Link>
        .
      </p>
    </LandingBlock>
  );
}
