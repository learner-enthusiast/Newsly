"use client";

import { prefersReducedMotion } from "@/components/about/diagrams/prefersReducedMotion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLayoutEffect } from "react";

let registered = false;

export function LandingStoryMotion() {
  useLayoutEffect(() => {
    if (prefersReducedMotion()) return;
    if (!registered) {
      gsap.registerPlugin(ScrollTrigger);
      registered = true;
    }

    const root = document.querySelector<HTMLElement>("[data-landing-page]");
    if (!root) return;

    const ctx = gsap.context(() => {
      gsap.utils.toArray<SVGGeometryElement>("[data-landing-draw]").forEach((el) => {
        const length = el.getTotalLength?.();
        if (!length) return;
        gsap.set(el, { strokeDasharray: length, strokeDashoffset: length });
        gsap.to(el, {
          strokeDashoffset: 0,
          duration: 1.2,
          ease: "power2.out",
          scrollTrigger: { trigger: el, scroller: root, start: "top 90%", once: true },
        });
      });
    }, root);

    return () => ctx.revert();
  }, []);

  return null;
}
