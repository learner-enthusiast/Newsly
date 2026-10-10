import { Section, SectionHeading } from "@/components/about/AboutPageShell";
import { ACCENT, EVIDENCE_EDGES, EVIDENCE_NODES } from "@/components/about/aboutStory";

const byId = new Map(EVIDENCE_NODES.map((n) => [n.id, n]));

function EvidenceGraph() {
  return (
    <svg
      viewBox="0 0 760 440"
      className="w-full text-foreground"
      role="img"
      aria-label="Article text, a YouTube transcript, and session research feed NewsSource and ResearchSource rows, which together support one story"
    >
      {EVIDENCE_EDGES.map((edge) => {
        const a = byId.get(edge.from);
        const b = byId.get(edge.to);
        if (!a || !b) return null;
        const midY = (a.y + b.y) / 2;
        return (
          <path
            key={`${edge.from}-${edge.to}`}
            data-about-draw
            d={`M${a.x} ${a.y + 30} C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${b.y - 14}`}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.3"
            strokeWidth="1"
          />
        );
      })}
      {EVIDENCE_NODES.map((node) => {
        const isStory = node.tier === "story";
        const isSource = node.tier === "source";
        return (
          <g key={node.id} textAnchor="middle">
            <circle
              cx={node.x}
              cy={node.y - 6}
              r={isStory ? 6 : isSource ? 4 : 3}
              fill={isStory ? ACCENT : "currentColor"}
              opacity={isStory ? 1 : isSource ? 0.85 : 0.5}
            />
            <text
              x={node.x}
              y={node.y + 20}
              fill={isStory ? ACCENT : "currentColor"}
              fontSize={isStory ? 30 : isSource ? 14 : 13}
              fontFamily={isSource ? "var(--font-mono), ui-monospace, monospace" : "var(--font-display), Georgia, serif"}
              opacity={node.tier === "document" ? 0.7 : 1}
            >
              {node.label}
            </text>
          </g>
        );
      })}
      <g fill="currentColor" opacity="0.45" fontSize="10" letterSpacing="2">
        <text x="16" y="70">DOCUMENTS</text>
        <text x="16" y="222">SOURCES</text>
        <text x="16" y="392">STORY</text>
      </g>
    </svg>
  );
}

export function EvidenceSection() {
  return (
    <Section id="evidence">
      <div className="grid gap-16 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:gap-20">
        <SectionHeading
          eyebrow="Evidence"
          title="The writing sits on top of stored sources."
          lede="There is no separate claims database. A briefing keeps NewsSource rows on the story. Chat keeps ResearchSource rows on the session. Synthesis reads those texts—not the transcript of the conversation."
        />
        <div className="hidden sm:block lg:pt-6">
          <EvidenceGraph />
        </div>
        {/* Mobile: three tiers, top to bottom */}
        <ol className="sm:hidden">
          {(["document", "source", "story"] as const).map((tier) => {
            const labels = [...new Set(EVIDENCE_NODES.filter((n) => n.tier === tier).map((n) => n.label))];
            const isStory = tier === "story";
            return (
              <li key={tier} className="border-t border-border/30 py-5">
                <p className="text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase">
                  {tier === "document" ? "Documents" : tier === "source" ? "Sources" : "Story"}
                </p>
                <p
                  className={isStory ? "font-display mt-2 text-3xl" : "mt-2 font-mono text-sm text-foreground/80"}
                  style={isStory ? { color: ACCENT } : undefined}
                >
                  {labels.join("  ·  ")}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </Section>
  );
}
