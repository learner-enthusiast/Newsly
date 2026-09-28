"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type HeroVisualProps = {
  className?: string;
};

export function HeroVisual({ className }: HeroVisualProps) {
  return (
    <div
      className={cn("relative mx-auto w-full max-w-lg lg:max-w-none", className)}
    >
      <div
        className={cn(
          "relative bg-background",
          "[mask-image:radial-gradient(ellipse_88%_78%_at_50%_42%,#000_62%,transparent_100%)]",
          "[mask-size:100%_100%]",
          "[mask-repeat:no-repeat]",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static marketing asset */}
        <img
          src="/heroImage.png"
          alt="Newsly personalized news briefing preview"
          className="h-auto w-full object-contain bg-transparent"
          width={960}
          height={720}
          decoding="async"
          fetchPriority="high"
        />
      </div>

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {["Business", "Technology", "Real estate", "Markets"].map((label) => (
          <Badge key={label} variant="secondary" className="border-0 bg-muted/60">
            {label}
          </Badge>
        ))}
      </div>
    </div>
  );
}
