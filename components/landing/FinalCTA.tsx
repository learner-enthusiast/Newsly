import { GetStartedButton } from "@/components/landing/GetStartedButton";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function FinalCTA() {
  return (
    <section id="start" className="border-t border-border/25 py-32 sm:py-40 lg:py-48">
      <div className="landing-section text-center">
        <h2 className="font-display mx-auto max-w-3xl text-5xl leading-[1.02] font-normal tracking-tight text-balance sm:text-6xl lg:text-7xl">
          Don&apos;t stop at the headline.
        </h2>
        <p className="mx-auto mt-7 max-w-md text-lg text-muted-foreground">
          Curious about something? Research it.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <GetStartedButton label="Start researching" />
          <Button
            variant="outline"
            size="lg"
            className="rounded-full"
            nativeButton={false}
            render={<Link href="/about" />}
          >
            How Newsly works
          </Button>
        </div>
      </div>
    </section>
  );
}
