"use client";

import { SignUpButton } from "@clerk/nextjs";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto">
      <section className="footer-cta" aria-labelledby="footer-cta-heading">
        <div className="footer-cta-wave" aria-hidden />
        <div className="landing-section relative z-10 flex flex-col items-center gap-5 py-16 text-center md:py-20">
          <h2
            id="footer-cta-heading"
            className="text-display max-w-2xl text-3xl text-primary-foreground md:text-4xl"
          >
            Two days. A city full of stories.
          </h2>
          <p className="max-w-xl text-base text-primary-foreground/85 md:text-lg">
            Build your next festival route with a little less planning and a lot
            more wandering.
          </p>
          <SignUpButton mode="modal">
            <Button type="button" variant="brand-accent">
              Create My Plan
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </SignUpButton>
        </div>
      </section>

      <div className="border-t border-border/20 bg-muted/30 px-6 py-8">
        <div className="landing-section flex flex-col gap-4 py-0 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-brand text-sm text-foreground">Puja Planner</p>
          <p className="text-xs text-muted-foreground">
            Festival routes, pandals, and food stops — research-backed itineraries.
          </p>
          <p className="text-xs text-muted-foreground">
            © {year} Puja Planner. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
