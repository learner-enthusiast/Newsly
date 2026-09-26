"use client";

import gsap from "gsap";
import { useLayoutEffect, type RefObject } from "react";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useChatEntrance(
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
        { opacity: 0, y: 12 },
        {
          opacity: 1,
          y: 0,
          duration: 0.45,
          stagger: 0.07,
          ease: "power2.out",
        },
      );
    }, root);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function animateNewMessage(element: HTMLElement | null) {
  if (!element || prefersReducedMotion()) {
    return;
  }
  gsap.fromTo(
    element,
    { opacity: 0, y: 10 },
    { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" },
  );
}

/** Stagger refresh for sidebar quick actions / suggested questions. */
export function animateSuggestionRefresh(container: HTMLElement | null) {
  if (!container || prefersReducedMotion()) {
    return;
  }
  const items = container.querySelectorAll("[data-suggestion-item]");
  if (items.length === 0) {
    return;
  }
  gsap.fromTo(
    items,
    { opacity: 0, y: 10, scale: 0.97 },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.42,
      stagger: 0.055,
      ease: "back.out(1.35)",
    },
  );
}
