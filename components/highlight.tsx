"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type HighlightProps = {
  children: ReactNode;
  className?: string;
};

export function Highlight({ children, className }: HighlightProps) {
  return (
    <span className={cn("highlight", className)}>
      <span className="highlight-text">{children}</span>
      <svg
        className="highlight-stroke"
        viewBox="0 0 300 24"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M4 14 C45 10, 80 18, 120 13 S190 10, 230 14 S270 11, 296 13"
          pathLength={1}
        />
      </svg>
    </span>
  );
}
