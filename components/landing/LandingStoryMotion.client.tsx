"use client";

import { prefersReducedMotion } from "@/components/about/diagrams/prefersReducedMotion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLayoutEffect } from "react";

let registered = false;

function overflowScroller(from: HTMLElement): HTMLElement | Window {
  const about = document.querySelector<HTMLElement>("[data-about-page]");
  if (about && about.contains(from)) {
    return about;
  }
  let node: HTMLElement | null = from;
  let outermost: HTMLElement | null = null;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1) {
      outermost = node;
    }
    node = node.parentElement;
  }
  return outermost ?? window;
}

export function LandingStoryMotion() {
  useLayoutEffect(() => {
    if (prefersReducedMotion()) return;
    if (!registered) {
      gsap.registerPlugin(ScrollTrigger);
      registered = true;
    }

    const root = document.querySelector<HTMLElement>("[data-landing-page]");
    if (!root) return;
    const scroller = overflowScroller(root);

    const ctx = gsap.context(() => {
      gsap.utils.toArray<SVGGeometryElement>("[data-landing-draw]").forEach((el) => {
        const length = el.getTotalLength?.();
        if (!length) return;
        gsap.set(el, { strokeDasharray: length, strokeDashoffset: length });
        gsap.to(el, {
          strokeDashoffset: 0,
          duration: 1.2,
          ease: "power2.out",
          scrollTrigger: { trigger: el, scroller, start: "top 90%", once: true },
        });
      });

      gsap.utils.toArray<HTMLElement>("[data-headline-layers]").forEach((group) => {
        const layers = group.querySelectorAll<HTMLElement>("[data-headline-layer]");
        if (layers.length === 0) {
          return;
        }
        gsap.set(layers, { x: 96, opacity: 0 });
        layers.forEach((layer) => {
          gsap.to(layer, {
            x: 0,
            opacity: 1,
            ease: "none",
            scrollTrigger: {
              trigger: layer,
              scroller,
              start: "top 90%",
              end: "top 62%",
              scrub: 0.7,
            },
          });
        });
      });

      gsap.utils.toArray<HTMLElement>("[data-chat-turns]").forEach((group) => {
        const turns = group.querySelectorAll<HTMLElement>("[data-chat-turn]");
        turns.forEach((turn) => {
          const fromRight = turn.getAttribute("data-chat-turn") === "user";
          const fromX = fromRight ? 96 : -96;
          gsap.set(turn, { x: fromX, opacity: 0 });
          gsap.to(turn, {
            x: 0,
            opacity: 1,
            ease: "none",
            scrollTrigger: {
              trigger: turn,
              scroller,
              start: "top 90%",
              end: "top 62%",
              scrub: 0.7,
            },
          });
        });
      });
    }, root);

    ScrollTrigger.refresh();

    return () => ctx.revert();
  }, []);

  return null;
}
