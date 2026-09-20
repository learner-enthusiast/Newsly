"use client";

import type { ReactNode } from "react";
import { SignUpButton } from "@clerk/nextjs";
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { Highlight } from "@/components/highlight";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type IllustrationSlot = {
  pic?: string | null;
};

type FeatureItem = IllustrationSlot & {
  title: string;
  description: string;
};

type HowItWorksStep = IllustrationSlot & {
  step: string;
  title: string;
};

type ShowcaseStop = IllustrationSlot & {
  label: string;
  kind: "pandal" | "food" | "chai";
};

type ShowcaseNote = IllustrationSlot & {
  text: string;
  className?: string;
};

const HERO_ILLUSTRATIONS: IllustrationSlot[] = [
  { pic: null },
  { pic: null },
  { pic: null },
  { pic: null },
];

const HERO_FLOW = ["SEARCH", "DISCOVER", "PLAN", "GO"] as const;

const FEATURES: FeatureItem[] = [
  {
    title: "Real places",
    description:
      "Discover actual pandals, food stalls, and local spots — not generic lists.",
    pic: null,
  },
  {
    title: "Smart routes",
    description:
      "Group nearby places into practical day routes you can actually follow.",
    pic: null,
  },
  {
    title: "Fresh information",
    description:
      "Research current festival details and local context before you go.",
    pic: null,
  },
  {
    title: "Your plan",
    description:
      "Drag, remove, reorder, or add anything once the route is built.",
    pic: null,
  },
];

const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
  { step: "01", title: "Tell us what you want", pic: null },
  { step: "02", title: "We research the festival", pic: null },
  { step: "03", title: "We discover places nearby", pic: null },
  { step: "04", title: "We build the route", pic: null },
  { step: "05", title: "You make it yours", pic: null },
];

const SHOWCASE_STOPS: ShowcaseStop[] = [
  { label: "Pandal A", kind: "pandal", pic: null },
  { label: "Food stop", kind: "food", pic: null },
  { label: "Pandal B", kind: "pandal", pic: null },
  { label: "Chai stop", kind: "chai", pic: null },
];

const SHOWCASE_NOTES: ShowcaseNote[] = [
  {
    text: "Pandal A is known for its architectural view",
    className: "-right-2 top-8 max-w-[11rem] sm:-right-16",
    pic: null,
  },
  {
    text: "Grab rolls between hops",
    className: "-left-2 bottom-24 max-w-[10rem] sm:-left-20",
    pic: null,
  },
];

function SketchSlot({
  pic,
  alt,
  className,
}: IllustrationSlot & { alt: string; className?: string }) {
  if (pic) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- user-supplied illustration URLs later
      <img src={pic} alt={alt} className={cn("sketch-image", className)} />
    );
  }

  return (
    <div
      className={cn("sketch-placeholder", className)}
      role="img"
      aria-label={alt}
    />
  );
}

function BrandCta({
  children,
  className,
}: Readonly<{
  children: ReactNode;
  className?: string;
}>) {
  return (
    <SignUpButton mode="modal">
      <Button type="button" variant="brand" className={className}>
        {children}
      </Button>
    </SignUpButton>
  );
}

const HomePage = () => {
  return (
    <div className="w-full pb-4">
      <section
        id="explore"
        className="landing-section relative overflow-hidden pt-10 pb-16 md:pt-14 md:pb-20"
      >
        <div className="pointer-events-none absolute inset-0 hidden md:block">
          <SketchSlot
            pic={HERO_ILLUSTRATIONS[0]?.pic}
            alt="Traveler with notebook"
            className="sketch-placeholder-lg absolute top-6 left-0 w-36 -rotate-6"
          />
          <SketchSlot
            pic={HERO_ILLUSTRATIONS[1]?.pic}
            alt="Temple archway"
            className="sketch-placeholder-md absolute top-10 right-8 w-32 rotate-3"
          />
          <SketchSlot
            pic={HERO_ILLUSTRATIONS[2]?.pic}
            alt="Festive flags"
            className="sketch-placeholder-sm absolute bottom-32 left-12 w-24"
          />
          <SketchSlot
            pic={HERO_ILLUSTRATIONS[3]?.pic}
            alt="Dhak drum"
            className="sketch-placeholder-lg absolute right-0 bottom-16 w-40 rotate-6"
          />
        </div>

        <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
          <h1 className="hero-title text-balance">
            Puja hopping,
            <br />
            without <Highlight>the guesswork</Highlight>
          </h1>
          <p className="text-body max-w-2xl text-base text-muted-foreground md:text-lg">
            Tell us the festival, the city, and how much time you have.
            We&apos;ll research the places, build the route, and turn it into a
            plan you can actually follow.
          </p>

          <div className="search-pill mt-2 w-full max-w-2xl">
            <label className="search-pill-label" htmlFor="hero-plan-prompt">
              What do you want to explore?
            </label>
            <div className="search-pill-row">
              <input
                id="hero-plan-prompt"
                className="search-pill-input"
                placeholder="Make 2-day Durga Puja plan in Kolkata..."
                readOnly
                onFocus={(event) => event.currentTarget.blur()}
              />
              <BrandCta className="shrink-0">
                Build My Plan
                <ArrowRightIcon data-icon="inline-end" />
              </BrandCta>
            </div>
          </div>

          <p className="font-brand text-lg text-foreground/90">
            Real places. Real routes. A plan you can edit.
          </p>

          <p className="flow-track mt-4" aria-label="How planning flows">
            {HERO_FLOW.map((step, index) => (
              <span key={step} className="inline-flex items-center gap-2">
                {index > 0 ? (
                  <span className="text-muted-foreground/60" aria-hidden>
                    →
                  </span>
                ) : null}
                <span>{step}</span>
              </span>
            ))}
          </p>
        </div>
      </section>

      <section
        className="landing-section py-14 md:py-16"
        aria-labelledby="features-heading"
      >
        <h2 id="features-heading" className="sr-only">
          What you get
        </h2>
        <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="feature-card">
              <SketchSlot
                pic={feature.pic}
                alt=""
                className="sketch-placeholder-md mx-auto mb-4 w-full max-w-[8.5rem]"
              />
              <h3 className="feature-card-title">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="how-it-works"
        className="landing-section py-14 md:py-16"
        aria-labelledby="how-heading"
      >
        <p className="section-eyebrow mb-3 text-center">How it works</p>
        <h2
          id="how-heading"
          className="text-display mb-10 text-center text-3xl md:text-4xl"
        >
          How your plan comes together
        </h2>
        <ol className="grid gap-8 md:grid-cols-5">
          {HOW_IT_WORKS_STEPS.map((item, index) => (
            <li key={item.step} className="how-step">
              {index > 0 ? (
                <span className="how-step-arrow hidden md:inline" aria-hidden>
                  →
                </span>
              ) : null}
              <SketchSlot
                pic={item.pic}
                alt=""
                className="sketch-placeholder-sm mb-4 aspect-square w-full max-w-[5.5rem]"
              />
              <p className="font-mono text-xs text-muted-foreground">
                {item.step}
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {item.title}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section
        id="festivals"
        className="landing-section py-14 md:py-16"
        aria-labelledby="showcase-heading"
      >
        <p className="section-eyebrow mb-3 text-center">Showcase</p>
        <h2
          id="showcase-heading"
          className="text-display mb-10 text-center text-3xl md:text-4xl"
        >
          Your festival. Your route.
        </h2>

        <div className="relative mx-auto max-w-xl">
          {SHOWCASE_NOTES.map((note) => (
            <p
              key={note.text}
              className={cn(
                "showcase-note font-brand absolute z-10 hidden text-sm sm:block",
                note.className,
              )}
            >
              {note.text}
            </p>
          ))}

          <div className="plan-showcase-card mx-auto max-w-md p-5 md:p-6">
            <p className="mb-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Day 01 — South Kolkata
            </p>
            <ol className="flex flex-col gap-4">
              {SHOWCASE_STOPS.map((stop, index) => (
                <li key={stop.label} className="showcase-timeline-item">
                  <SketchSlot
                    pic={stop.pic}
                    alt=""
                    className="sketch-placeholder-xs size-10 shrink-0 rounded-full"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-medium">{stop.label}</span>
                    <span className="text-xs text-muted-foreground capitalize">
                      {stop.kind}
                    </span>
                  </div>
                  {index < SHOWCASE_STOPS.length - 1 ? (
                    <span className="showcase-timeline-rail" aria-hidden />
                  ) : null}
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-8 flex justify-center">
            <Link href="/#festivals">
              <Button variant="brand">
                See a sample plan
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
