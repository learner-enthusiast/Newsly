"use client";

import { GetStartedButton } from "@/components/landing/GetStartedButton";
import { HeroVisual } from "@/components/landing/HeroVisual";
import { prefersReducedMotion } from "@/components/landing/useLandingMotion";
import { Button } from "@/components/ui/button";
import { Check, Play } from "lucide-react";
import gsap from "gsap";
import Link from "next/link";
import { useLayoutEffect, useRef } from "react";

const BENEFITS = [
  "Curated from trusted sources",
  "Local & global coverage",
  "Save & organize your news",
] as const;

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section || prefersReducedMotion()) {
      return;
    }
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
      tl.from("[data-hero='eyebrow']", { opacity: 0, y: 16, duration: 0.5 })
        .from(
          "[data-hero='heading']",
          { opacity: 0, y: 20, duration: 0.55 },
          "-=0.25",
        )
        .from(
          "[data-hero='desc']",
          { opacity: 0, y: 18, duration: 0.5 },
          "-=0.3",
        )
        .from(
          "[data-hero='cta']",
          { opacity: 0, y: 16, duration: 0.45 },
          "-=0.25",
        )
        .from(
          "[data-hero='benefits']",
          { opacity: 0, y: 12, duration: 0.4 },
          "-=0.2",
        )
        .from(
          "[data-hero='visual']",
          { opacity: 0, scale: 0.97, duration: 0.65 },
          "-=0.5",
        )
        .from(
          "[data-hero-float]",
          { opacity: 0, y: 10, duration: 0.45, stagger: 0.12 },
          "-=0.35",
        );
    }, section);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="landing-section grid gap-12 pb-10 pt-8 sm:pt-12 lg:grid-cols-2 lg:items-center lg:gap-14 lg:pb-16 lg:pt-16"
    >
      <div className="flex flex-col gap-6">
        <p
          data-hero="eyebrow"
          className="text-sm font-medium tracking-wide text-[#c85d3f]"
        >
          ✦ Your Personal News Intelligence
        </p>
        <h1 data-hero="heading" className="hero-title text-balance">
          Stay Informed
          <br />
          with News that
          <br />
          <span className="relative inline-block">
            <span className="highlight-text">Actually Matters</span>
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
        <p
          data-hero="desc"
          className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
        >
          Get personalized, AI-curated news from trusted sources — focusing on
          the topics, locations, and stories that matter to you.
        </p>
        <div data-hero="cta" className="flex flex-wrap gap-3">
          <GetStartedButton />
          <Button
            variant="outline"
            size="lg"
            className="rounded-full"
            nativeButton={false}
            render={<Link href="#how-it-works" />}
          >
            <Play data-icon="inline-start" className="fill-current" />
            Watch Demo
          </Button>
        </div>
        <ul
          data-hero="benefits"
          className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-6"
        >
          {BENEFITS.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <Check className="size-4 shrink-0 text-[#c85d3f]" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div data-hero="visual">
        <HeroVisual />
      </div>
    </section>
  );
}
