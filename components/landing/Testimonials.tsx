"use client";

import { DEMO_TESTIMONIALS } from "@/components/landing/landingData";
import { useScrollRevealSection } from "@/components/landing/useLandingMotion";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useRef } from "react";

export function Testimonials() {
  const sectionRef = useRef<HTMLElement>(null);
  useScrollRevealSection(sectionRef, "[data-testimonial]");

  return (
    <section ref={sectionRef} className="py-14 sm:py-16">
      <div className="landing-section flex flex-col gap-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="section-eyebrow">Social proof</p>
          <h2 className="font-display mt-2 text-3xl font-semibold">
            What Our Users Say
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Placeholder testimonials for layout preview — not verified customer
            reviews.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {DEMO_TESTIMONIALS.map((item) => (
            <Card
              key={item.id}
              data-testimonial
              data-demo-testimonial
              size="sm"
              className="h-full border-border/60 bg-card/95"
            >
              <CardHeader className="flex flex-row items-center gap-3">
                <span
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold"
                  aria-hidden
                >
                  {item.initials}
                </span>
                <div>
                  <p className="text-sm font-semibold">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.role} · {item.location}
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                <blockquote className="text-sm leading-relaxed text-muted-foreground">
                  &ldquo;{item.quote}&rdquo;
                </blockquote>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
