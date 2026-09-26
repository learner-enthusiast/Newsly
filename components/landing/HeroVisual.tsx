"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO_FLOATING_CARDS } from "@/components/landing/landingData";
import { cn } from "@/lib/utils";
import { Coffee, Laptop, Sprout } from "lucide-react";

type HeroVisualProps = {
  className?: string;
  cardClassName?: string;
};

export function HeroVisual({ className, cardClassName }: HeroVisualProps) {
  return (
    <div
      className={cn("relative mx-auto w-full max-w-lg lg:max-w-none", className)}
      aria-hidden={false}
    >
      <p className="sr-only">
        Illustration: person reading personalized news on a laptop with sample
        story cards marked as demo content.
      </p>

      <div className="relative rounded-3xl border border-border/50 bg-linear-to-br from-[#fde2d2]/50 via-card to-muted/30 p-6 shadow-editorial sm:p-8">
        <div className="relative mx-auto flex max-w-xs flex-col items-center">
          <div className="relative z-10 flex size-28 items-center justify-center rounded-full bg-secondary/80 ring-4 ring-card">
            <span className="font-display text-4xl text-foreground/80">☺</span>
          </div>
          <div className="relative z-10 -mt-4 flex w-full items-end justify-center gap-3">
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <Sprout className="size-5" aria-hidden />
            </div>
            <div className="flex h-24 w-36 items-center justify-center rounded-xl border border-border/40 bg-card shadow-paper">
              <Laptop className="size-10 text-foreground/70" aria-hidden />
            </div>
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <Coffee className="size-5" aria-hidden />
            </div>
          </div>
        </div>

        <div
          data-hero-float="0"
          className={cn(
            "absolute top-6 right-2 w-[11.5rem] sm:right-6",
            cardClassName,
          )}
        >
          <Card size="sm" className="border-border/60 bg-card/95 shadow-paper">
            <CardHeader className="pb-1">
              <Badge variant="outline" className="w-fit text-[10px]">
                Demo · {DEMO_FLOATING_CARDS[0]!.location}
              </Badge>
              <CardTitle className="text-xs leading-snug">
                {DEMO_FLOATING_CARDS[0]!.headline}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div
          data-hero-float="1"
          className={cn(
            "absolute bottom-16 left-0 w-[11rem] sm:left-4",
            cardClassName,
          )}
        >
          <Card size="sm" className="border-border/60 bg-card/95 shadow-paper">
            <CardHeader className="pb-1">
              <Badge variant="outline" className="w-fit text-[10px]">
                Demo · {DEMO_FLOATING_CARDS[1]!.location}
              </Badge>
              <CardTitle className="text-xs leading-snug">
                {DEMO_FLOATING_CARDS[1]!.headline}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <p
          data-hero-float="2"
          className="absolute bottom-4 left-1/2 w-[min(100%,14rem)] -translate-x-1/2 rounded-xl border border-accent/40 bg-accent/25 px-3 py-2 text-center text-xs font-medium text-foreground"
        >
          Summarized, relevant and easy to read ✨
          <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">
            Sample UI preview
          </span>
        </p>
      </div>

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {["Business", "Technology", "Real estate", "Markets"].map((label) => (
          <Badge key={label} variant="outline" className="bg-card/80">
            {label}
          </Badge>
        ))}
      </div>
    </div>
  );
}
