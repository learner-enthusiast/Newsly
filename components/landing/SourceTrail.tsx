import { LandingBlock, LandingEyebrow } from "@/components/landing/LandingBlock";
import { ACCENT, STORY_TRAIL } from "@/components/landing/homeStory";

const CENTER = { x: 360, y: 148 };

/** Baseline positions. Top lines leave the bottom of the label; bottom lines leave the top. */
const NODES = [
  { label: "The notice", x: 150, y: 44, side: "top" },
  { label: "A market report", x: 570, y: 44, side: "top" },
  { label: "An industry response", x: 168, y: 318, side: "bottom" },
  { label: "A video briefing", x: 552, y: 318, side: "bottom" },
] as const;

function sourceLine(node: (typeof NODES)[number]) {
  const fromY = node.side === "top" ? node.y + 12 : node.y - 22;
  const dx = CENTER.x - node.x;
  const dy = CENTER.y - fromY;
  const length = Math.hypot(dx, dy) || 1;
  const endGap = 22;
  return {
    x1: node.x,
    y1: fromY,
    x2: CENTER.x - (dx / length) * endGap,
    y2: CENTER.y - (dy / length) * endGap,
  };
}

export function SourceTrail() {
  return (
    <LandingBlock id="sources">
      <div className="grid items-center gap-16 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div>
          <LandingEyebrow>Where it came from</LandingEyebrow>
          <h2 className="font-display mt-5 text-4xl leading-[1.05] font-normal tracking-tight text-balance sm:text-5xl">
            Don&apos;t just trust the answer. See where it came from.
          </h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
            A story keeps the pages and videos it was written from. A chat answer is written from the research saved on that session — not from the conversation itself.
          </p>
        </div>

        <div>
          <svg
            viewBox="0 0 720 360"
            className="hidden w-full text-foreground sm:block"
            role="img"
            aria-label="Four sources connect to one story in the center"
          >
            {NODES.map((node) => {
              const line = sourceLine(node);
              return (
                <path
                  key={`line-${node.label}`}
                  data-landing-draw
                  d={`M${line.x1} ${line.y1} L${line.x2} ${line.y2}`}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity="0.35"
                  strokeWidth="1"
                />
              );
            })}
            {NODES.map((node) => (
              <text
                key={node.label}
                x={node.x}
                y={node.y}
                textAnchor="middle"
                fill="currentColor"
                opacity="0.8"
                fontSize="16"
                fontFamily="var(--font-display), Georgia, serif"
              >
                {node.label}
              </text>
            ))}
            <circle cx={CENTER.x} cy={CENTER.y} r="5" fill={ACCENT} />
            <text
              x={CENTER.x}
              y={CENTER.y + 58}
              textAnchor="middle"
              fill={ACCENT}
              fontSize="28"
              fontFamily="var(--font-display), Georgia, serif"
            >
              Story
            </text>
          </svg>

          <ol className="sm:hidden">
            {STORY_TRAIL.map((source) => (
              <li key={source} className="border-t border-border/40 py-3 text-lg">
                {source}
              </li>
            ))}
            <li className="border-t border-border/40 py-3 font-display text-2xl" style={{ color: ACCENT }}>
              Story
            </li>
          </ol>
        </div>
      </div>
    </LandingBlock>
  );
}
