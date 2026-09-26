"use client";

import { GetStartedButton } from "@/components/landing/GetStartedButton";
import { useScrollRevealSection } from "@/components/landing/useLandingMotion";
import { useRef } from "react";

export function FinalCTA() {
  const sectionRef = useRef<HTMLElement>(null);
  useScrollRevealSection(sectionRef);

  return (
    <section id="pricing" ref={sectionRef} className="pb-16 pt-4 sm:pb-20">
      <div className="landing-section">
        <div className="relative overflow-hidden rounded-3xl border border-[#f0c4a8]/60 bg-linear-to-b from-[#fde2d2]/70 via-[#fff5eb] to-card px-6 py-12 text-center shadow-editorial sm:px-10 sm:py-14">
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-[#c85d3f]/10 to-transparent"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-x-8 bottom-4 h-16 rounded-t-[40%] border border-[#c85d3f]/15 bg-[#c85d3f]/5"
            aria-hidden
          />

          <h2 className="font-display relative mx-auto max-w-2xl text-2xl font-semibold sm:text-3xl">
            Be the First to Experience a Smarter Way to Read News
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-muted-foreground">
            Get personalized news that keeps you informed without overwhelming
            you.
          </p>
          <div className="relative mt-6 flex flex-col items-center gap-2">
            <GetStartedButton />
            <p className="text-xs text-muted-foreground">
              Free to get started · No credit card required
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
