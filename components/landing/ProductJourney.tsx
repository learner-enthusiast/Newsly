"use client";

import { PRODUCT_JOURNEY_STEPS } from "@/components/landing/landingData";
import { useScrollRevealSection } from "@/components/landing/useLandingMotion";
import {
  FileText,
  Filter,
  Newspaper,
  Search,
  Settings2,
  Sparkles,
} from "lucide-react";
import { useRef } from "react";

const JOURNEY_ICONS = [
  Settings2,
  Search,
  Newspaper,
  Filter,
  Sparkles,
  FileText,
] as const;

export function ProductJourney() {
  const sectionRef = useRef<HTMLElement>(null);
  useScrollRevealSection(sectionRef, "[data-journey-step]");

  return (
    <section
      id="product-journey"
      ref={sectionRef}
      className="border-y border-border/30 bg-card/40 py-10 sm:py-12"
    >
      <div className="landing-section overflow-x-auto">
        <div className="flex min-w-[640px] items-center justify-between gap-2 px-2">
          {PRODUCT_JOURNEY_STEPS.map((label, index) => {
            const Icon = JOURNEY_ICONS[index] ?? Settings2;
            return (
              <div key={label} className="flex flex-1 items-center gap-2">
                <div
                  data-journey-step
                  className="flex flex-col items-center gap-2 text-center"
                >
                  <span className="flex size-10 items-center justify-center rounded-full border border-border/60 bg-background shadow-paper">
                    <Icon className="size-4 text-[#c85d3f]" aria-hidden />
                  </span>
                  <span className="max-w-[5.5rem] text-xs font-medium leading-tight">
                    {label}
                  </span>
                </div>
                {index < PRODUCT_JOURNEY_STEPS.length - 1 ? (
                  <div
                    className="h-px flex-1 bg-border/70"
                    aria-hidden
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
