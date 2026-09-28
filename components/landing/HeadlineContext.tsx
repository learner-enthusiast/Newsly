import { LandingBlock, LandingEyebrow } from "@/components/landing/LandingBlock";
import { ACCENT, HEADLINE_LAYERS } from "@/components/landing/homeStory";

export function HeadlineContext() {
  return (
    <LandingBlock id="headline">
      <div className="grid items-start gap-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-24">
        <div className="lg:sticky lg:top-28">
          <LandingEyebrow>The headline is not the story</LandingEyebrow>
          <h2 className="font-display mt-5 max-w-lg text-4xl leading-[1.05] font-normal tracking-tight text-balance sm:text-5xl">
            A headline tells you what happened. It rarely tells you enough.
          </h2>
          <p className="mt-6 max-w-sm text-base leading-relaxed text-muted-foreground">
            Newsly is built to keep going: what led here, who it touches, where the sources agree, and what is still open.
          </p>
        </div>

        <div>
          <p className="text-[0.7rem] tracking-[0.18em] text-muted-foreground uppercase">
            Illustration, not a live story
          </p>
          <p className="font-display mt-4 max-w-md text-3xl leading-snug sm:text-4xl">
            India raises duties on imported electric cars
          </p>
          <ol className="mt-10">
            {HEADLINE_LAYERS.map((layer, i) => (
              <li key={layer.kicker} className="grid grid-cols-[2.5rem_1fr] gap-4 border-t border-border/40 py-5">
                <span className="pt-1 text-xs" style={{ color: ACCENT }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-display text-2xl font-normal">{layer.kicker}</h3>
                  <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">{layer.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </LandingBlock>
  );
}
