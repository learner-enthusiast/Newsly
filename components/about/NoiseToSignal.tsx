import { Section, SectionHeading } from "@/components/about/AboutPageShell";
import { ACCENT, NOISE_STEPS, noiseCloud } from "@/components/about/aboutStory";

const CLOUD = noiseCloud(84);
const INTERNET = ["Articles", "Videos", "Search results", "Pages"] as const;
const RESEARCH = ["Story", "Sources", "Context"] as const;

/** Wide composition: cloud → intelligence layer → story. viewBox 0 0 1200 400 */
function NoiseToSignalDesktop() {
  const laneY = [110, 150, 190, 230, 270, 310];
  return (
    <svg
      viewBox="0 0 1200 400"
      className="hidden w-full text-foreground lg:block"
      role="img"
      aria-label="Many small sources on the left pass through search, selection, deduplication, extraction, evidence, and synthesis, and arrive as a story with sources on the right"
    >
      {/* Internet cloud */}
      <g fill="currentColor" opacity="0.45">
        {CLOUD.map((p) => (
          <circle key={`${p.x}-${p.y}`} cx={p.x} cy={p.y} r={p.r} />
        ))}
      </g>
      <text x="40" y="24" fill="currentColor" fontSize="11" letterSpacing="2.4" opacity="0.55">
        INTERNET
      </text>

      {/* Flow lanes into the layer */}
      {laneY.map((y, i) => (
        <path
          key={`lane-${y}`}
          data-about-flow
          data-count={2}
          d={`M250 ${60 + i * 52} C 360 ${60 + i * 52}, 380 ${y}, 480 ${y}`}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.16"
          strokeWidth="1"
        />
      ))}

      {/* Intelligence layer */}
      <line x1="480" y1="70" x2="480" y2="340" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
      <line x1="720" y1="70" x2="720" y2="340" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
      <text x="600" y="24" textAnchor="middle" fill={ACCENT} fontSize="11" letterSpacing="2.4">
        NEWSLY
      </text>
      {NOISE_STEPS.map((step, i) => (
        <g key={step}>
          <line x1="480" y1={laneY[i]} x2="720" y2={laneY[i]} stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" />
          <circle cx="480" cy={laneY[i]} r="2.5" fill="currentColor" opacity="0.6" />
          <text
            x="600"
            y={laneY[i] - 8}
            textAnchor="middle"
            fill="currentColor"
            fontSize="12"
            letterSpacing="1.6"
            opacity="0.8"
          >
            {step.toUpperCase()}
          </text>
        </g>
      ))}

      {/* Out of the layer, converging into one artifact */}
      {laneY.map((y) => (
        <path
          key={`out-${y}`}
          data-about-flow
          data-count={1}
          d={`M720 ${y} C 800 ${y}, 820 200, 900 200`}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.16"
          strokeWidth="1"
        />
      ))}

      {/* Story artifact */}
      <g transform="translate(900 120)">
        <rect x="0" y="0" width="220" height="160" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1" />
        <rect x="18" y="20" width="120" height="8" fill="currentColor" opacity="0.8" />
        {[46, 62, 78, 94].map((y) => (
          <rect key={y} x="18" y={y} width={y === 94 ? 110 : 184} height="3" fill="currentColor" opacity="0.3" />
        ))}
        {[120, 132].map((y) => (
          <g key={y}>
            <circle cx="22" cy={y + 1} r="2" fill={ACCENT} />
            <rect x="32" y={y - 1} width="90" height="3" fill={ACCENT} opacity="0.55" />
          </g>
        ))}
      </g>
      <text x="1010" y="24" textAnchor="middle" fill="currentColor" fontSize="11" letterSpacing="2.4" opacity="0.55">
        RESEARCH
      </text>

      <g data-about-flow-layer />
    </svg>
  );
}

export function NoiseToSignal() {
  return (
    <Section id="signal">
      <SectionHeading
        eyebrow="From noise to signal"
        title="A wide field of sources, narrowed to something you can read."
        lede="News discovery and chat research both pass through search, selection, scraping, and synthesis. What remains is stored separately from the words written on top of it."
      />

      <div className="mt-20 lg:mt-28">
        <NoiseToSignalDesktop />

        {/* Tablet / mobile: vertical redesign, not a shrunken diagram */}
        <div className="grid gap-12 lg:hidden">
          <div>
            <p className="text-[0.7rem] tracking-[0.2em] text-muted-foreground uppercase">Internet</p>
            <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              {INTERNET.map((item) => (
                <li key={item} className="font-display text-2xl text-foreground/70">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="border-l pl-6" style={{ borderColor: ACCENT }}>
            <p className="text-[0.7rem] tracking-[0.2em] uppercase" style={{ color: ACCENT }}>
              Newsly
            </p>
            <ol className="mt-4 space-y-2 text-sm tracking-[0.12em] text-foreground/80 uppercase">
              {NOISE_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
          <div>
            <p className="text-[0.7rem] tracking-[0.2em] text-muted-foreground uppercase">Research</p>
            <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              {RESEARCH.map((item) => (
                <li key={item} className="font-display text-3xl">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Section>
  );
}
