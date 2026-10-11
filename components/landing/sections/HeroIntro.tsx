"use client";

import {
  sectionAttrs,
  Stagger,
  type HeroSectionProps,
} from "@/components/landing/Stagger";
import { DARK, dark, HERO_INTRO, ROUTES } from "@/lib/landing/content";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { memo } from "react";

export const HeroIntro = memo(function HeroIntro({ opacity }: HeroSectionProps) {
  const visible = opacity > 0.3;

  return (
    <section
      className="absolute inset-0 flex items-center px-6 sm:px-8 md:px-20 lg:px-32"
      {...sectionAttrs(opacity)}
    >
      <div>
        <Stagger visible={visible} delay={0}>
          <h1
            className="leading-[1.2] font-light uppercase"
            style={{ fontSize: "clamp(2rem,5vw,5rem)", color: DARK }}
          >
            {HERO_INTRO.title}
          </h1>
        </Stagger>
        <Stagger visible={visible} delay={150}>
          <p
            className="mt-6 text-sm tracking-[0.3em] uppercase"
            style={{ color: dark(0.9) }}
          >
            {HERO_INTRO.subtitle}
          </p>
        </Stagger>
      </div>

      <Stagger
        visible={visible}
        delay={300}
        className="absolute right-6 bottom-12 sm:right-8 md:right-12"
      >
        <Link
          href={ROUTES.news}
          aria-label={HERO_INTRO.ctaLabel}
          className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current"
          style={{ borderColor: dark(0.5), color: DARK }}
        >
          <ArrowRight size={18} />
        </Link>
      </Stagger>
    </section>
  );
});
