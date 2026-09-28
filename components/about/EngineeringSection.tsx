import { Section, SectionHeading } from "@/components/about/AboutPageShell";
import { ACCENT, ENGINEERING_LAYERS, LIFECYCLE } from "@/components/about/aboutStory";

export function EngineeringSection() {
  return (
    <Section id="engineering">
      <SectionHeading
        eyebrow="Engineering"
        title={
          <>
            Built as a research system,
            {" "}<br className="hidden sm:block" />
            not a chatbot wrapper.
          </>
        }
        lede="Long research does not live inside one HTTP request. Inngest runs the jobs and retries them. Postgres keeps the sources. Models write only after the text is in hand."
      />

      <ol data-about-reveal className="mt-20 max-w-4xl lg:mt-28">
        {ENGINEERING_LAYERS.map((row, i) => (
          <li
            key={row.layer}
            data-about-item
            className="grid gap-2 border-t border-border/30 py-7 sm:grid-cols-[2.5rem_11rem_1fr] sm:items-baseline"
          >
            <span className="text-xs" style={{ color: ACCENT }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-[0.7rem] tracking-[0.18em] text-muted-foreground uppercase">{row.layer}</span>
            <span className="font-display text-2xl sm:text-3xl">{row.names.join("  ·  ")}</span>
          </li>
        ))}
        <li className="border-t border-border/30" aria-hidden />
      </ol>
    </Section>
  );
}

export function LifecycleSection() {
  return (
    <Section id="lifecycle">
      <SectionHeading eyebrow="What is kept" title="From the open web to something a person can finish." align="center" />

      {/* Desktop: one editorial line with seven marks */}
      <div className="mt-20 hidden lg:block">
        <svg viewBox="0 0 1200 140" className="w-full text-foreground" role="img" aria-label={LIFECYCLE.join(", then ")}>
          <path data-about-draw d="M60 60 H1140" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" fill="none" />
          {LIFECYCLE.map((label, i) => {
            const x = 60 + (i * 1080) / (LIFECYCLE.length - 1);
            const last = i === LIFECYCLE.length - 1;
            const anchor = i === 0 ? "start" : last ? "end" : "middle";
            return (
              <g key={label}>
                <circle cx={x} cy="60" r={last ? 6 : 3.5} fill={last ? ACCENT : "currentColor"} />
                <text
                  x={x}
                  y={i % 2 === 0 ? 34 : 100}
                  textAnchor={anchor}
                  fill={last ? ACCENT : "currentColor"}
                  fontSize="17"
                  fontFamily="var(--font-display), Georgia, serif"
                >
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Mobile: vertical */}
      <ol className="mx-auto mt-16 max-w-sm lg:hidden">
        {LIFECYCLE.map((step, i) => (
          <li key={step} className="flex items-baseline gap-5 border-t border-border/25 py-4">
            <span className="w-6 text-xs" style={{ color: ACCENT }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="font-display text-2xl">{step}</span>
          </li>
        ))}
      </ol>
    </Section>
  );
}
