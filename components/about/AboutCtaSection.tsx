import { GetStartedButton } from "@/components/landing/GetStartedButton";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export function AboutCtaSection() {
  return (
    <section className="border-t border-border/25 py-32 sm:py-40 lg:py-48">
      <div className="landing-section text-center">
        <h2 className="font-display mx-auto max-w-3xl text-5xl leading-[1.02] font-normal tracking-tight text-balance sm:text-6xl lg:text-7xl">
          Read less noise.
          {" "}<br className="hidden sm:block" />
          Understand more.
        </h2>
        <p className="mx-auto mt-7 max-w-md text-lg text-muted-foreground">
          Start with a briefing, or open a research chat and follow one question until the sources hold.
        </p>
        <div className="mt-11 flex flex-wrap items-center justify-center gap-3">
          <Button variant="brand" nativeButton={false} render={<Link href="/news" />}>
            Explore Newsly
            <ArrowRight data-icon="inline-end" />
          </Button>
          <GetStartedButton label="Start researching" />
        </div>
      </div>
    </section>
  );
}
