"use client";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import type { ReactNode } from "react";

const EASE = "cubic-bezier(0.16,1,0.3,1)";

/** Fades and lifts its children in (24px → 0) when `visible`. */
export function Stagger({
  visible,
  delay = 0,
  className,
  children,
}: {
  visible: boolean;
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  const reduced = usePrefersReducedMotion();

  return (
    <div
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: reduced
          ? "none"
          : `opacity 0.8s ${EASE} ${delay}ms, transform 0.8s ${EASE} ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/** Props shared by the three hero sections. */
export type HeroSectionProps = { opacity: number };

/** Section wrapper attrs: hidden sections are neither focusable nor announced. */
export function sectionAttrs(opacity: number) {
  const hidden = opacity <= 0;
  return {
    style: { opacity, transition: "opacity 0.1s ease-out" },
    "aria-hidden": hidden || undefined,
    inert: hidden,
  } as const;
}
