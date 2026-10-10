"use client";

import { prefersReducedMotion } from "@/components/about/diagrams/prefersReducedMotion";
import gsap from "gsap";
import { useLayoutEffect, useRef } from "react";

/** Globe and source cards from `public/heroImage.png`, revealed from depth. */
export function HeroVisual() {
  const stageRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<HTMLImageElement>(null);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const art = artRef.current;
    if (!stage || !art) {
      return;
    }

    if (prefersReducedMotion()) {
      gsap.set(art, { opacity: 1, clearProps: "transform,filter" });
      return;
    }

    gsap.set(stage, { perspective: 1400, transformStyle: "preserve-3d" });
    const tween = gsap.fromTo(
      art,
      {
        opacity: 0,
        scale: 1.22,
        y: 64,
        z: -220,
        rotationX: 9,
        filter: "blur(22px)",
      },
      {
        opacity: 1,
        scale: 1,
        y: 0,
        z: 0,
        rotationX: 0,
        filter: "blur(0px)",
        duration: 1.45,
        delay: 0.12,
        ease: "power3.out",
      },
    );

    return () => {
      tween.kill();
    };
  }, []);

  return (
    <div
      ref={stageRef}
      className="relative mx-auto w-full max-w-xl lg:max-w-none"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static marketing asset */}
      <img
        ref={artRef}
        src="/heroImage.png"
        alt="Stories from cities, markets, policy, and trade, connected around the world"
        className="h-auto w-full origin-[50%_62%] object-contain opacity-0 will-change-transform"
        width={1058}
        height={906}
        decoding="async"
        fetchPriority="high"
      />
    </div>
  );
}
