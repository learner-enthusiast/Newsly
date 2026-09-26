"use client";

import gsap from "gsap";
import { useLayoutEffect, type RefObject } from "react";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useLandingEntrance(
  containerRef: RefObject<HTMLElement | null>,
  selector: string,
  deps: unknown[] = [],
) {
  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root || prefersReducedMotion()) {
      return;
    }
    const items = root.querySelectorAll(selector);
    if (items.length === 0) {
      return;
    }
    const ctx = gsap.context(() => {
      gsap.fromTo(
        items,
        { opacity: 0, y: 28 },
        {
          opacity: 1,
          y: 0,
          duration: 0.65,
          stagger: 0.1,
          ease: "power2.out",
          delay: 0.05,
        },
      );
    }, root);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional entrance deps
  }, deps);
}

export function useScrollRevealSection(
  sectionRef: RefObject<HTMLElement | null>,
  staggerSelector?: string,
) {
  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section || prefersReducedMotion()) {
      return;
    }

    const targets = staggerSelector
      ? section.querySelectorAll(staggerSelector)
      : [section];

    gsap.set(targets, { opacity: 0, y: 24 });

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) {
          return;
        }
        gsap.to(targets, {
          opacity: 1,
          y: 0,
          duration: 0.55,
          stagger: staggerSelector ? 0.08 : 0,
          ease: "power2.out",
        });
        observer.disconnect();
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, [sectionRef, staggerSelector]);
}
