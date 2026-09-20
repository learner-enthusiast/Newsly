"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type MarkerHighlightProps = {
  children: ReactNode;
  className?: string;
  /** Slightly stronger fill for active stepper / selected labels */
  emphasis?: boolean;
};

export function MarkerHighlight({
  children,
  className,
  emphasis = false,
}: MarkerHighlightProps) {
  return (
    <span
      className={cn(
        "marker-highlight-pill",
        emphasis && "marker-highlight-pill-emphasis",
        className,
      )}
    >
      {children}
    </span>
  );
}
