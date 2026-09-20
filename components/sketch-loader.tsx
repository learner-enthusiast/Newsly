"use client";

import { cn } from "@/lib/utils";

type SketchLoaderProps = {
  label?: string;
  /** `inline` for lists; `panel` for overlays; `page` for full-width sections */
  variant?: "inline" | "panel" | "page";
  className?: string;
};

export function SketchLoader({
  label = "Loading…",
  variant = "inline",
  className,
}: SketchLoaderProps) {
  return (
    <div
      className={cn(
        "sketch-loader",
        variant === "panel" && "sketch-loader-panel",
        variant === "page" && "sketch-loader-page",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="sketch-loader-visual" aria-hidden>
        <span className="sketch-loader-orbit" />
        <span className="sketch-loader-core">🪔</span>
      </div>
      <p className="sketch-loader-label">{label}</p>
      <div className="sketch-loader-track" aria-hidden>
        <span className="sketch-loader-track-fill" />
      </div>
    </div>
  );
}
