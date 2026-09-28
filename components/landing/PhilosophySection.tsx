import { LandingBlock } from "@/components/landing/LandingBlock";

export function PhilosophySection() {
  return (
    <LandingBlock id="why">
      <div className="mx-auto max-w-4xl">
        <h2 className="font-display text-4xl leading-[1.02] font-normal tracking-tight text-balance sm:text-6xl lg:text-7xl">
          News was never supposed to be a race to read the most headlines.
        </h2>
        <p className="mt-10 max-w-xl text-xl leading-relaxed text-muted-foreground sm:text-2xl">
          The goal is not to consume more information. The goal is to understand what matters.
        </p>
      </div>
    </LandingBlock>
  );
}
