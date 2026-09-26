"use client";

import { DEMO_TRENDING_STORIES } from "@/components/landing/landingData";
import { TrendingCard } from "@/components/landing/TrendingCard";
import { useScrollRevealSection } from "@/components/landing/useLandingMotion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

export function TrendingSection() {
  const sectionRef = useRef<HTMLElement>(null);
  useScrollRevealSection(sectionRef, "[data-trend-card]");

  return (
    <section id="topics" ref={sectionRef} className="py-14 sm:py-16">
      <div className="landing-section flex flex-col gap-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-eyebrow">Sample briefing</p>
            <h2 className="font-display mt-2 text-3xl font-semibold">
              See What&apos;s Trending
            </h2>
            <p className="mt-2 max-w-xl text-muted-foreground">
              A glimpse of the kind of news you&apos;ll get with Newsly. Cards
              below are demo content, not live headlines.
            </p>
          </div>
          <Link
            href="#topics"
            className="inline-flex items-center gap-1 text-sm font-medium text-[#c85d3f] hover:underline"
          >
            Explore All Topics
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {DEMO_TRENDING_STORIES.map((story) => (
            <div key={story.id} data-trend-card>
              <TrendingCard story={story} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
