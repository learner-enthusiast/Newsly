"use client";

import { FEATURE_STRIP } from "@/components/landing/landingData";
import { useScrollRevealSection } from "@/components/landing/useLandingMotion";
import {
  BarChart3,
  Bookmark,
  Globe2,
  Shield,
  Target,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useRef } from "react";

const ICONS: Record<(typeof FEATURE_STRIP)[number]["icon"], LucideIcon> = {
  target: Target,
  globe: Globe2,
  zap: Zap,
  shield: Shield,
  bookmark: Bookmark,
  chart: BarChart3,
};

export function FeatureStrip() {
  const sectionRef = useRef<HTMLElement>(null);
  useScrollRevealSection(sectionRef, "[data-feature-item]");

  return (
    <section
      id="features"
      ref={sectionRef}
      className="border-y border-border/30 bg-card/60 py-10 sm:py-12"
    >
      <div className="landing-section">
        <div className="rounded-3xl border border-border/50 bg-card px-4 py-8 shadow-paper sm:px-8">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {FEATURE_STRIP.map(({ title, description, icon }) => {
              const Icon = ICONS[icon];
              return (
                <div
                  key={title}
                  data-feature-item
                  className="flex flex-col gap-2 text-center sm:text-left"
                >
                  <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-[#fde2d2]/80 text-[#c85d3f] sm:mx-0">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
