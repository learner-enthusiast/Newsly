import { LandingBlock, LandingEyebrow } from "@/components/landing/LandingBlock";
import { ACCENT, RESEARCH_POINTS } from "@/components/landing/homeStory";

export function ResearchDifference() {
  return (
    <LandingBlock id="research">
      <LandingEyebrow>Beyond a summary</LandingEyebrow>
      <h2 className="font-display mt-5 max-w-3xl text-4xl leading-[1.05] font-normal tracking-tight text-balance sm:text-5xl">
        A summary stops. Research keeps the trail.
      </h2>

      <div className="mt-16 grid gap-16 lg:grid-cols-2 lg:gap-24">
        <div>
          <p className="text-[0.7rem] tracking-[0.18em] text-muted-foreground uppercase">Summary</p>
          <p className="font-display mt-4 max-w-sm text-2xl leading-snug text-foreground/80">
            “Company announces a change to electric-vehicle imports.”
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Useful, and finished. You still don&apos;t know the notice, the disagreement, or what you already read yesterday.
          </p>
        </div>

        <div>
          <p className="text-[0.7rem] tracking-[0.18em] uppercase" style={{ color: ACCENT }}>
            Research
          </p>
          <ul className="mt-4 max-w-md">
            {RESEARCH_POINTS.map((point, i) => (
              <li key={point} className="flex gap-4 border-t border-border/40 py-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full" style={{ background: ACCENT }} aria-hidden />
                <span className="text-base leading-relaxed">
                  <span className="sr-only">{i + 1}. </span>
                  {point}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Answers and stories are written from pages that were actually read, plus research this conversation already kept.
          </p>
        </div>
      </div>
    </LandingBlock>
  );
}
