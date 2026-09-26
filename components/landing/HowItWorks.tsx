"use client";

import { HOW_IT_WORKS_STEPS } from "@/components/landing/landingData";
import { useScrollRevealSection } from "@/components/landing/useLandingMotion";
import { ArrowRight, FileText, Search, Settings2, Sparkles } from "lucide-react";
import { useRef } from "react";

const STEP_ICONS = [Settings2, Search, Sparkles, FileText] as const;

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  useScrollRevealSection(sectionRef, "[data-step]");

  return (
    <section id="how-it-works" ref={sectionRef} className="border-t border-border/30 bg-muted/15 py-14 sm:py-16">
      <div className="landing-section flex flex-col gap-10">
        <div className="mx-auto max-w-2xl text-center">
          <p className="section-eyebrow">Process</p>
          <h2 className="font-display mt-2 text-3xl font-semibold">How It Works</h2>
          <p className="mt-2 text-muted-foreground">
            Get your personalized news in just a few simple steps.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-4">
          {HOW_IT_WORKS_STEPS.map((step, index) => {
            const Icon = STEP_ICONS[index] ?? Settings2;
            return (
              <div key={step.step} data-step className="relative flex flex-col gap-3">
                {index < HOW_IT_WORKS_STEPS.length - 1 ? (
                  <ArrowRight
                    className="absolute top-8 -right-3 hidden size-5 text-muted-foreground/50 lg:block"
                    aria-hidden
                  />
                ) : null}
                <div className="flex items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#c85d3f] text-sm font-semibold text-white">
                    {step.step}
                  </span>
                  <Icon className="size-5 text-muted-foreground" aria-hidden />
                </div>
                <h3 className="font-medium">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
