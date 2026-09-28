import { Section, SectionHeading } from "@/components/about/AboutPageShell";
import { ACCENT, PROBLEM_WORDS } from "@/components/about/aboutStory";

const CENTER = { x: 480, y: 200 };

export function ProblemSection() {
  return (
    <Section id="problem">
      <SectionHeading
        eyebrow="The problem"
        title={
          <>
            The internet has information.
            {" "}<br className="hidden sm:block" />
            The problem is finding what matters.
          </>
        }
        lede="Search returns fragments. Chat forgets what it already read. A briefing is only useful when the sources are still attached to it."
      />

      {/* Mobile: the same idea, composed vertically */}
      <div className="mt-16 sm:hidden">
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          {PROBLEM_WORDS.map((word) => (
            <li key={word.label} className="font-display text-2xl text-foreground/60">
              {word.label}
            </li>
          ))}
        </ul>
        <div className="my-8 ml-1 h-14 w-px bg-foreground/30" aria-hidden />
        <p className="font-display text-4xl" style={{ color: ACCENT }}>
          Signal
        </p>
      </div>

      <div data-about-problem className="mt-20 hidden sm:block lg:mt-28">
        <svg
          viewBox="0 0 960 400"
          className="w-full text-foreground"
          role="img"
          aria-label="Headlines, videos, articles, sources, documents, threads, and claims converge into one signal"
        >
          {PROBLEM_WORDS.map((word) => (
            <path
              key={`edge-${word.label}`}
              data-about-draw
              d={`M${word.x + 40} ${word.y + 6} Q ${(word.x + CENTER.x) / 2} ${(word.y + CENTER.y) / 2 + 40} ${CENTER.x} ${CENTER.y}`}
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.22"
              strokeWidth="1"
            />
          ))}
          {PROBLEM_WORDS.map((word) => (
            <text
              key={word.label}
              data-problem-word
              data-dx={(word.x - CENTER.x) * 0.18}
              data-dy={(word.y - CENTER.y) * 0.18}
              x={word.x}
              y={word.y}
              fill="currentColor"
              fillOpacity="0.72"
              fontSize="26"
              fontFamily="var(--font-display), Georgia, serif"
            >
              {word.label}
            </text>
          ))}
          <g data-problem-signal>
            <circle cx={CENTER.x} cy={CENTER.y} r="5" fill={ACCENT} />
            <text
              x={CENTER.x}
              y={CENTER.y + 46}
              textAnchor="middle"
              fill={ACCENT}
              fontSize="36"
              fontFamily="var(--font-display), Georgia, serif"
            >
              Signal
            </text>
          </g>
        </svg>
      </div>
    </Section>
  );
}
