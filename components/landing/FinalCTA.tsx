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
        <div className="relative min-h-[22rem] overflow-hidden rounded-3xl sm:min-h-[26rem] lg:min-h-[30rem]">
          {/* eslint-disable-next-line @next/next/no-img-element -- static marketing asset */}
          <img
            src="/footerImg.png"
            alt=""
            aria-hidden
            className="absolute inset-0 size-full object-cover object-center"
            decoding="async"
          />
          <div
            className="pointer-events-none absolute inset-0 bg-background/15"
            aria-hidden
          />

          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 py-12 text-center sm:px-10 sm:py-14">
            <h2 className="font-display mx-auto max-w-2xl text-2xl font-semibold drop-shadow-sm sm:text-3xl">
              Be the First to Experience a Smarter Way to Read News
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground drop-shadow-sm">
              Get personalized news that keeps you informed without overwhelming
              you.
            </p>
            <div className="mt-6 flex flex-col items-center gap-2">
              <GetStartedButton />
              <p className="text-xs text-muted-foreground drop-shadow-sm">
                Free to get started · No credit card required
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
