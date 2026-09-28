import { Eyebrow } from "@/components/about/AboutPageShell";
import { ACCENT } from "@/components/about/aboutStory";

const STEPS = ["Internet", "Research", "Evidence", "Understanding"] as const;

function HeroIllustration() {
  // A single descending line; the chaos at the top settles into a point.
  const cloud = [
    [30, 22], [58, 10], [84, 30], [44, 46], [112, 14], [136, 40], [96, 54], [160, 26], [70, 66], [184, 50], [22, 62], [148, 66],
  ] as const;
  return (
    <svg
      viewBox="0 0 960 300"
      className="mt-20 hidden w-full text-foreground sm:block"
      role="img"
      aria-label="Scattered points at the left settle along one line into research, evidence, and understanding"
    >
      <g fill="currentColor" opacity="0.28">
        {cloud.map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x + 40} cy={y + 90} r="2" />
        ))}
      </g>
      <path
        data-about-draw
        d="M140 150 C 300 150, 340 168, 420 168 S 600 176, 660 176 S 860 184, 900 184"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1"
      />
      {STEPS.map((label, i) => {
        const x = [140, 420, 660, 900][i];
        const y = [150, 168, 176, 184][i];
        const last = i === STEPS.length - 1;
        return (
          <g key={label}>
            <circle cx={x} cy={y} r={last ? 6 : 3.5} fill={last ? ACCENT : "currentColor"} />
            <text
              x={x}
              y={y + 42}
              textAnchor="middle"
              fill="currentColor"
              fontSize="15"
              fontFamily="var(--font-display), Georgia, serif"
              opacity={last ? 1 : 0.75}
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function AboutHero() {
  return (
    <header className="pt-20 pb-6 sm:pt-28 lg:pt-36">
      <div className="landing-section">
        <Eyebrow>How Newsly works</Eyebrow>
        <h1 className="font-display mt-7 max-w-5xl text-[2.75rem] leading-[1] font-normal tracking-tight text-balance sm:text-6xl lg:text-[5.25rem]">
          From a noisy internet
          {" "}<br className="hidden sm:block" />
          to research you can trust.
        </h1>
        <p className="mt-9 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
          Newsly searches the open web, keeps the sources, and writes briefings
          and answers from that evidence. Discovery, chat, and stories are
          different paths through the same record.
        </p>
        <HeroIllustration />
        <ol className="mt-14 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground sm:hidden">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-3">
              <span className={i === STEPS.length - 1 ? "font-display text-base text-foreground" : ""}>{label}</span>
              {i < STEPS.length - 1 ? <span aria-hidden>→</span> : null}
            </li>
          ))}
        </ol>
      </div>
    </header>
  );
}
