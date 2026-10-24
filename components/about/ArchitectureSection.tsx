import { Section, SectionHeading } from "@/components/about/AboutPageShell";
import { ACCENT, ARCH_EDGES, ARCH_MOBILE, ARCH_NODES } from "@/components/about/aboutStory";

const byId = new Map(ARCH_NODES.map((n) => [n.id, n]));

function ArchitectureDesktop() {
  return (
    <svg
      viewBox="0 0 960 540"
      className="hidden w-full text-foreground md:block"
      role="img"
      aria-label="Reader, Next.js, Inngest, three pipelines, research services, and PostgreSQL with pgvector, connected top to bottom"
    >
      {ARCH_EDGES.map((edge) => {
        const a = byId.get(edge.from);
        const b = byId.get(edge.to);
        if (!a || !b) return null;
        const midY = (a.y + b.y) / 2;
        return (
          <path
            key={`${edge.from}-${edge.to}`}
            data-about-draw
            d={`M${a.x} ${a.y + (a.sub ? 30 : 12)} C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${b.y - 36}`}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.3"
            strokeWidth="1"
          />
        );
      })}
      {ARCH_NODES.map((node) => {
        const isPipeline = node.id === "news" || node.id === "chat" || node.id === "story";
        return (
          <g key={node.id}>
            <circle cx={node.x} cy={node.y - 30} r="3" fill={isPipeline ? ACCENT : "currentColor"} opacity={isPipeline ? 1 : 0.6} />
            <text
              x={node.x}
              y={node.y}
              textAnchor="middle"
              fill="currentColor"
              fontSize={node.id === "research" || node.id === "db" ? 17 : 20}
              fontFamily="var(--font-display), Georgia, serif"
            >
              {node.label}
            </text>
            {node.sub ? (
              <text
                x={node.x}
                y={node.y + 18}
                textAnchor="middle"
                fill="currentColor"
                opacity="0.55"
                fontSize="11"
                fontFamily="var(--font-mono), ui-monospace, monospace"
              >
                {node.sub}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export function ArchitectureSection() {
  return (
    <Section id="system">
      <SectionHeading
        eyebrow="How Newsly works"
        title={
          <>
            One system.
            {" "}<br className="hidden sm:block" />
            Several research paths.
          </>
        }
        lede="A news request becomes many stories. A chat message becomes an answer—or, on a general chat, a draft story. A deep dive starts from a story you can already open, then continues as chat."
      />
      <div className="mt-20 lg:mt-28">
        <ArchitectureDesktop />
        <ol className="space-y-0 md:hidden">
          {ARCH_MOBILE.map((label, i) => (
            <li key={label} className="flex items-baseline gap-5 border-t border-border/30 py-5">
              <span className="w-6 text-xs" style={{ color: ACCENT }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="font-display text-2xl">{label}</span>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
