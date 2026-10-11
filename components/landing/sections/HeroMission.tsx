"use client";

import {
  sectionAttrs,
  Stagger,
  type HeroSectionProps,
} from "@/components/landing/Stagger";
import { DARK, dark, HERO_MISSION } from "@/lib/landing/content";
import { ArrowDown, ChevronUp } from "lucide-react";
import { memo } from "react";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current";

export const HeroMission = memo(function HeroMission({
  opacity,
  onNext,
  onTop,
}: HeroSectionProps & { onNext: () => void; onTop: () => void }) {
  const visible = opacity > 0.3;

  return (
    <section
      className="absolute inset-0 flex items-center justify-center px-6 sm:px-8"
      {...sectionAttrs(opacity)}
    >
      <div className="max-w-[900px]">
        <Stagger visible={visible} delay={0}>
          <h2
            className="text-center leading-[1.3] font-extralight tracking-wide uppercase"
            style={{ fontSize: "clamp(1.5rem,4.5vw,4.5rem)", color: DARK }}
          >
            {HERO_MISSION.lead}
            <span style={{ color: dark(0.8) }}>{HERO_MISSION.mid}</span>{" "}
            <span style={{ color: dark(0.5) }}>{HERO_MISSION.tail}</span>
          </h2>
        </Stagger>
      </div>

      <div className="absolute right-6 bottom-16 flex flex-col items-center gap-4 sm:right-8 md:right-12">
        <Stagger visible={visible} delay={200}>
          <button
            type="button"
            onClick={onNext}
            aria-label={HERO_MISSION.nextLabel}
            className={`pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border ${FOCUS}`}
            style={{ borderColor: dark(0.4), color: DARK }}
          >
            <ArrowDown size={18} />
          </button>
        </Stagger>
        <Stagger visible={visible} delay={350} className="mt-4">
          <div aria-hidden="true" className="flex flex-col items-center gap-2">
            <span
              className="block h-2 w-2 rounded-full"
              style={{ backgroundColor: DARK }}
            />
            <span
              className="block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: dark(0.4) }}
            />
            <span
              className="block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: dark(0.4) }}
            />
          </div>
        </Stagger>
        <Stagger visible={visible} delay={500} className="mt-2">
          <button
            type="button"
            onClick={onTop}
            aria-label={HERO_MISSION.topLabel}
            className={`pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border ${FOCUS}`}
            style={{ borderColor: dark(0.3), color: dark(0.8) }}
          >
            <ChevronUp size={16} />
          </button>
        </Stagger>
      </div>
    </section>
  );
});
