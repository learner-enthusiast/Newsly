"use client";

import { prefersReducedMotion } from "@/components/about/diagrams/prefersReducedMotion";
import gsap from "gsap";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLayoutEffect } from "react";

let registered = false;
function registerPlugins() {
  if (registered || typeof window === "undefined") return;
  gsap.registerPlugin(ScrollTrigger, MotionPathPlugin);
  registered = true;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Progressive enhancement for /about. Everything it touches already renders
 * statically on the server; this only adds motion that explains the flow.
 *
 * data-about-draw            stroke draws in when scrolled into view
 * data-about-reveal          children with data-about-item fade/rise in sequence
 * data-about-flow            path that particles travel along (data-count)
 * data-about-flow-layer      <g> that receives the particles
 * data-about-stages          container; [data-about-stage] highlight in order
 * data-about-story           chat→story scrubbed transformation
 * data-about-problem         scattered words converge as the section scrolls
 */
export function AboutMotion() {
  useLayoutEffect(() => {
    if (prefersReducedMotion()) return;
    registerPlugins();

    const root = document.querySelector<HTMLElement>("[data-about-page]");
    if (!root) return;
    const scroller = root;

    const ctx = gsap.context(() => {
      // 1. Stroke drawing
      gsap.utils.toArray<SVGGeometryElement>("[data-about-draw]").forEach((el) => {
        const length = el.getTotalLength?.();
        if (!length) return;
        gsap.set(el, { strokeDasharray: length, strokeDashoffset: length });
        gsap.to(el, {
          strokeDashoffset: 0,
          duration: 1.4,
          ease: "power2.out",
          scrollTrigger: { trigger: el, scroller, start: "top 88%", once: true },
        });
      });

      // 2. Sequential reveals
      gsap.utils.toArray<HTMLElement>("[data-about-reveal]").forEach((group) => {
        const items = group.querySelectorAll("[data-about-item]");
        if (!items.length) return;
        gsap.fromTo(
          items,
          { opacity: 0, y: 14 },
          {
            opacity: 1,
            y: 0,
            duration: 0.6,
            stagger: 0.09,
            ease: "power2.out",
            scrollTrigger: { trigger: group, scroller, start: "top 85%", once: true },
          },
        );
      });

      // 3. Particles flowing along paths (paused when off-screen)
      gsap.utils.toArray<SVGPathElement>("[data-about-flow]").forEach((path) => {
        const svg = path.ownerSVGElement;
        const layer = svg?.querySelector<SVGGElement>("[data-about-flow-layer]");
        if (!svg || !layer) return;
        const count = Number(path.dataset.count ?? 3);
        const tl = gsap.timeline({ repeat: -1, paused: true });
        for (let i = 0; i < count; i += 1) {
          const dot = document.createElementNS(SVG_NS, "circle");
          dot.setAttribute("r", "2.4");
          dot.setAttribute("fill", "#c85d3f");
          dot.setAttribute("opacity", "0");
          layer.appendChild(dot);
          tl.to(
            dot,
            {
              motionPath: { path, align: path, alignOrigin: [0.5, 0.5] },
              opacity: 1,
              duration: 3.2,
              ease: "none",
              onStart: () => dot.setAttribute("opacity", "1"),
            },
            i * (3.2 / count),
          ).to(dot, { opacity: 0, duration: 0.3 }, "<+=2.9");
        }
        ScrollTrigger.create({
          trigger: svg,
          scroller,
          start: "top 90%",
          end: "bottom 10%",
          onToggle: (self) => (self.isActive ? tl.play() : tl.pause()),
        });
      });

      // 4. Pipeline stages light up in order
      gsap.utils.toArray<HTMLElement>("[data-about-stages]").forEach((group) => {
        const stages = group.querySelectorAll<HTMLElement>("[data-about-stage]");
        const line = group.querySelector<HTMLElement>("[data-about-stage-line]");
        const tl = gsap.timeline({
          scrollTrigger: { trigger: group, scroller, start: "top 75%", once: true },
        });
        if (line) tl.fromTo(line, { scaleX: 0 }, { scaleX: 1, duration: 1.6, ease: "power1.inOut" }, 0);
        tl.fromTo(
          stages,
          { opacity: 0.32 },
          { opacity: 1, duration: 0.4, stagger: 1.6 / Math.max(stages.length, 1), ease: "power1.out" },
          0,
        );
      });

      // 5. Chat bubble becomes a story (scrubbed)
      gsap.utils.toArray<HTMLElement>("[data-about-story]").forEach((wrap) => {
        const bubble = wrap.querySelector("[data-story-bubble]");
        const doc = wrap.querySelector("[data-story-doc]");
        const lines = wrap.querySelectorAll("[data-story-line]");
        if (!bubble || !doc) return;
        gsap
          .timeline({
            scrollTrigger: { trigger: wrap, scroller, start: "top 70%", end: "bottom 45%", scrub: 0.6 },
          })
          .fromTo(bubble, { opacity: 1, x: 0 }, { opacity: 0.25, x: 24, ease: "none" }, 0)
          .fromTo(doc, { opacity: 0.35, x: -24 }, { opacity: 1, x: 0, ease: "none" }, 0)
          .fromTo(lines, { scaleX: 0 }, { scaleX: 1, stagger: 0.08, transformOrigin: "left center", ease: "none" }, 0.2);
      });

      // 6. Scattered words drift toward the signal
      gsap.utils.toArray<HTMLElement>("[data-about-problem]").forEach((wrap) => {
        const words = wrap.querySelectorAll<SVGTextElement>("[data-problem-word]");
        const signal = wrap.querySelector("[data-problem-signal]");
        const tl = gsap.timeline({
          scrollTrigger: { trigger: wrap, scroller, start: "top 70%", end: "bottom 60%", scrub: 0.8 },
        });
        words.forEach((word) => {
          const dx = Number(word.dataset.dx ?? 0);
          const dy = Number(word.dataset.dy ?? 0);
          tl.fromTo(word, { x: dx, y: dy, opacity: 0.55 }, { x: 0, y: 0, opacity: 1, ease: "none" }, 0);
        });
        if (signal) tl.fromTo(signal, { opacity: 0.2 }, { opacity: 1, ease: "none" }, 0.3);
      });
    }, root);

    return () => ctx.revert();
  }, []);

  return null;
}
