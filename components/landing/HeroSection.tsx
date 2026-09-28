import { GetStartedButton } from "@/components/landing/GetStartedButton";
import { HeroVisual } from "@/components/landing/HeroVisual";
import { LandingEyebrow } from "@/components/landing/LandingBlock";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function HeroSection() {
  return (
    <section className="landing-section grid items-center gap-16 pt-16 pb-8 sm:pt-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-20 lg:pt-28 lg:pb-12">
      <div>
        <LandingEyebrow>News, researched.</LandingEyebrow>
        <h1 className="font-display mt-6 max-w-xl text-[2.75rem] leading-[1.02] font-normal tracking-tight text-balance sm:text-6xl lg:text-[4.5rem]">
          Don&apos;t just read <br className="hidden sm:block" />
          what happened. <br />
          <span className="relative inline-block">
            <span className="highlight-text">Understand why.</span>
            <svg
              className="highlight-stroke"
              viewBox="0 0 300 24"
              preserveAspectRatio="none"
              aria-hidden
            >
              <path d="M8 18 C 80 6, 120 22, 200 10 S 280 16, 292 12" />
            </svg>
          </span>
        </h1>
        <p className="mt-8 max-w-md text-lg leading-relaxed text-muted-foreground">
          Newsly looks past the headline for markets, economics, and business.
          It reads the sources, keeps them, and lets you keep asking.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <GetStartedButton label="Start researching" />
          <Button
            variant="outline"
            size="lg"
            className="rounded-full"
            nativeButton={false}
            render={<Link href="/newsStory" />}
          >
            Explore Newsly
          </Button>
        </div>
      </div>
      <HeroVisual />
    </section>
  );
}
