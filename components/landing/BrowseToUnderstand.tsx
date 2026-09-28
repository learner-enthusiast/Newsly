import { LandingBlock, LandingEyebrow } from "@/components/landing/LandingBlock";
import { ACCENT, BROWSE_PATH } from "@/components/landing/homeStory";

export function BrowseToUnderstand() {
  return (
    <LandingBlock id="paths">
      <LandingEyebrow>Two ways in</LandingEyebrow>
      <h2 className="font-display mt-5 max-w-3xl text-4xl leading-[1.05] font-normal tracking-tight text-balance sm:text-5xl">
        Sometimes you want to browse. Sometimes you want to investigate.
      </h2>

      <div className="mt-14 grid gap-12 border-t border-border/40 pt-10 sm:grid-cols-2">
        <div>
          <h3 className="font-display text-3xl font-normal">Discover</h3>
          <p className="mt-3 max-w-sm text-base leading-relaxed text-muted-foreground">
            “I want to know what&apos;s happening.” Choose a date, a place, and the topics you care about. You get a briefing, each story still attached to its sources.
          </p>
        </div>
        <div>
          <h3 className="font-display text-3xl font-normal">Investigate</h3>
          <p className="mt-3 max-w-sm text-base leading-relaxed text-muted-foreground">
            “I want to understand this.” Ask a question, follow it, and open a published story when you want to go further than the page in front of you.
          </p>
        </div>
      </div>

      <ol className="mt-20 grid gap-8 sm:grid-cols-2 lg:grid-cols-6">
        {BROWSE_PATH.map((step, i) => (
          <li key={step.label}>
            <p className="text-[0.7rem] tracking-[0.18em]" style={{ color: ACCENT }}>
              {String(i + 1).padStart(2, "0")}
            </p>
            <h3 className="font-display mt-2 text-2xl font-normal">{step.label}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
          </li>
        ))}
      </ol>
    </LandingBlock>
  );
}
