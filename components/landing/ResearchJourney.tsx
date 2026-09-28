import { LandingBlock, LandingEyebrow } from "@/components/landing/LandingBlock";
import { ACCENT, RESEARCH_STAGES } from "@/components/landing/homeStory";

export function ResearchJourney() {
  return (
    <LandingBlock id="inside">
      <LandingEyebrow>What happens when you ask</LandingEyebrow>
      <h2 className="font-display mt-5 max-w-3xl text-4xl leading-[1.05] font-normal tracking-tight text-balance sm:text-5xl">
        Search is the start. Understanding is the point.
      </h2>
      <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
        Newsly does not answer from a headline. It decides whether it already has enough, and only then goes looking for the rest.
      </p>

      <ol className="mt-16 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-5">
        {RESEARCH_STAGES.map((stage, i) => (
          <li key={stage.label} className="border-t border-border/40 pt-4">
            <p className="text-[0.7rem] tracking-[0.18em]" style={{ color: ACCENT }}>
              {String(i + 1).padStart(2, "0")}
            </p>
            <h3 className="font-display mt-3 text-2xl font-normal">{stage.label}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{stage.detail}</p>
          </li>
        ))}
      </ol>
    </LandingBlock>
  );
}
