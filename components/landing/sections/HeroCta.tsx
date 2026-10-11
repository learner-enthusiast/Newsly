"use client";

import {
  sectionAttrs,
  Stagger,
  type HeroSectionProps,
} from "@/components/landing/Stagger";
import { HERO_CTA, ROUTES } from "@/lib/landing/content";
import { SignUpButton, useAuth } from "@clerk/nextjs";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { memo } from "react";

const CTA_CLASS =
  "pointer-events-auto inline-flex items-center gap-4 text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current";

const ctaContent = (
  <>
    <span className="text-sm tracking-[0.3em] text-white/80 uppercase">
      {HERO_CTA.cta}
    </span>
    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-800 transition-transform duration-300 hover:scale-110">
      <ArrowRight size={16} />
    </span>
  </>
);

export const HeroCta = memo(function HeroCta({ opacity }: HeroSectionProps) {
  const visible = opacity > 0.3;
  const { isSignedIn } = useAuth();

  return (
    <section
      className="absolute inset-0 flex items-center justify-end px-6 sm:px-8 md:px-20 lg:px-32"
      {...sectionAttrs(opacity)}
    >
      <div className="max-w-2xl text-left">
        <Stagger visible={visible} delay={0}>
          <p className="mb-4 text-lg tracking-wide text-white/60">
            {HERO_CTA.eyebrow}
          </p>
        </Stagger>
        <Stagger visible={visible} delay={150}>
          <h2
            className="mb-8 leading-[1.2] font-light tracking-wide text-white uppercase"
            style={{ fontSize: "clamp(2rem,4vw,4rem)" }}
          >
            {HERO_CTA.titleLines[0]}
            <br />
            {HERO_CTA.titleLines[1]}
          </h2>
        </Stagger>
        <Stagger visible={visible} delay={300}>
          {isSignedIn ? (
            <Link href={ROUTES.newsletterCreate} className={CTA_CLASS}>
              {ctaContent}
            </Link>
          ) : (
            <SignUpButton
              mode="modal"
              forceRedirectUrl={ROUTES.newsletterCreate}
              signInForceRedirectUrl={ROUTES.newsletterCreate}
            >
              <button type="button" className={CTA_CLASS}>
                {ctaContent}
              </button>
            </SignUpButton>
          )}
        </Stagger>
      </div>
    </section>
  );
});
