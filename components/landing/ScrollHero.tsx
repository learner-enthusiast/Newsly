"use client";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { HeroCta } from "@/components/landing/sections/HeroCta";
import { HeroIntro } from "@/components/landing/sections/HeroIntro";
import { HeroMission } from "@/components/landing/sections/HeroMission";
import { useImageSequence } from "@/hooks/useImageSequence";
import { MOBILE_FRAMES_QUERY, POSTER } from "@/lib/landing/frames";
import { useCallback } from "react";

/** Sequential section opacities — each fades out before the next appears. */
function s1Opacity(p: number) {
  return p < 0.2 ? 1 : Math.max(0, 1 - (p - 0.2) / 0.08);
}
function s2Opacity(p: number) {
  if (p < 0.32) return 0;
  if (p < 0.4) return (p - 0.32) / 0.08;
  if (p < 0.55) return 1;
  return Math.max(0, 1 - (p - 0.55) / 0.08);
}
function s3Opacity(p: number) {
  if (p < 0.67) return 0;
  if (p < 0.75) return (p - 0.67) / 0.08;
  return 1;
}

/** Start of Section 3's fade-in plateau. */
const S3_PROGRESS = 0.75;

export function ScrollHero() {
  const {
    containerRef,
    canvasRef,
    posterRef,
    progress: p,
    canvasLive,
  } = useImageSequence();

  const scrollToProgress = useCallback((target: number) => {
    const el = containerRef.current;
    if (!el) return;
    const span = el.offsetHeight - window.innerHeight;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: target * span, behavior: reduce ? "auto" : "smooth" });
  }, [containerRef]);
  const toSection3 = useCallback(() => scrollToProgress(S3_PROGRESS), [scrollToProgress]);
  const toTop = useCallback(() => scrollToProgress(0), [scrollToProgress]);

  return (
    <main data-landing>
      <div ref={containerRef} className="relative h-[500vh]">
        <div className="sticky top-0 h-screen w-full overflow-hidden">
          {/* Frame 0 as a plain image so the first screen paints from SSR. */}
          <picture>
            <source media={MOBILE_FRAMES_QUERY} srcSet={POSTER.mobile} />
            <img
              ref={posterRef}
              src={POSTER.desktop}
              alt=""
              aria-hidden="true"
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </picture>
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
              canvasLive ? "opacity-100" : "opacity-0"
            }`}
          />
          <div className="pointer-events-none absolute inset-0">
            <LandingNavbar isLight={p > 0.55} />
            <HeroIntro opacity={s1Opacity(p)} />
            <HeroMission opacity={s2Opacity(p)} onNext={toSection3} onTop={toTop} />
            <HeroCta opacity={s3Opacity(p)} />
          </div>
        </div>
      </div>
    </main>
  );
}
