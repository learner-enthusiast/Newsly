"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useScrollRevealSection } from "@/components/landing/useLandingMotion";
import { BookOpen, Layers, Target } from "lucide-react";
import { useRef } from "react";

const DIFF_CARDS = [
  {
    title: "Personalized",
    description: "Not one-size-fits-all news.",
    icon: Target,
  },
  {
    title: "Contextual",
    description: "Understand what happened and why it matters.",
    icon: Layers,
  },
  {
    title: "Explorable",
    description:
      "Go from summary to original sources and deeper research.",
    icon: BookOpen,
  },
] as const;

export function ProductDifference() {
  const sectionRef = useRef<HTMLElement>(null);
  useScrollRevealSection(sectionRef, "[data-diff-card]");

  return (
    <section ref={sectionRef} className="py-14 sm:py-16">
      <div className="landing-section grid gap-10 lg:grid-cols-2 lg:items-start">
        <div>
          <p className="section-eyebrow">Why Newsly</p>
          <h2 className="font-display mt-2 text-3xl font-semibold text-balance">
            News shouldn&apos;t feel like noise.
          </h2>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            Tell Newsly what you care about — your location, topics, and
            interests.
          </p>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            Newsly finds relevant stories, removes the noise, connects related
            coverage, and gives you a concise briefing you can read in minutes.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          {DIFF_CARDS.map(({ title, description, icon: Icon }) => (
            <Card
              key={title}
              data-diff-card
              size="sm"
              className="h-full border-border/60 bg-card/90"
            >
              <CardHeader>
                <span className="flex size-10 items-center justify-center rounded-lg bg-[#fde2d2]/70 text-[#c85d3f]">
                  <Icon className="size-5" aria-hidden />
                </span>
                <CardTitle className="text-base">{title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {description}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
