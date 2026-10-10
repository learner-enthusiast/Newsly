import { Section, SectionHeading } from "@/components/about/AboutPageShell";
import { ACCENT, VECTOR_POINTS } from "@/components/about/aboutStory";

const STEPS = ["Previous research", "Embedding", "Vector space", "Similarity search", "Relevant research", "Current question"] as const;

function VectorField() {
  const query = VECTOR_POINTS.find((p) => p.query);
  const related = VECTOR_POINTS.filter((p) => p.related);
  return (
    <svg
      viewBox="0 0 640 320"
      className="w-full text-foreground"
      role="img"
      aria-label="A field of earlier research points; the current question sits among a few close, related points"
    >
      {query
        ? related.map((p) => (
            <line
              key={`link-${p.id}`}
              data-about-draw
              x1={query.x}
              y1={query.y}
              x2={p.x}
              y2={p.y}
              stroke={ACCENT}
              strokeOpacity="0.5"
              strokeWidth="1"
            />
          ))
        : null}
      {query ? (
        <circle cx={query.x} cy={query.y} r="58" fill="none" stroke={ACCENT} strokeOpacity="0.28" strokeWidth="1" strokeDasharray="2 4" />
      ) : null}
      {VECTOR_POINTS.map((p) => (
        <circle
          key={p.id}
          cx={p.x}
          cy={p.y}
          r={p.r}
          fill={p.query ? ACCENT : "currentColor"}
          fillOpacity={p.query ? 1 : p.related ? 0.7 : 0.22}
        />
      ))}
      {query ? (
        <text className="hidden sm:block" x={query.x} y={query.y + 80} textAnchor="middle" fill="currentColor" fontSize="12" opacity="0.7">
          This question
        </text>
      ) : null}
      <text className="hidden sm:block" x="92" y="300" fill="currentColor" fontSize="10" letterSpacing="2" opacity="0.45">
        EARLIER SESSION RESEARCH
      </text>
    </svg>
  );
}

export function VectorSection() {
  return (
    <Section id="memory">
      <SectionHeading
        eyebrow="Research memory"
        title="Earlier research can answer the next question."
        lede="When a chat source is saved, a short description is embedded with text-embedding-3-small and stored in pgvector. Later messages in the same session retrieve the closest rows (top 8, similarity ≥ 0.72) before spending another search."
        align="center"
      />
      <div className="mx-auto mt-20 max-w-3xl lg:mt-24">
        <VectorField />
        <p className="mt-3 text-center text-xs text-muted-foreground sm:hidden">
          <span style={{ color: ACCENT }}>●</span> this question, among earlier session research
        </p>
      </div>
      <ol data-about-reveal className="mx-auto mt-14 flex max-w-3xl flex-wrap justify-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
        {STEPS.map((step, i) => (
          <li key={step} data-about-item className="flex items-center gap-3">
            <span className={i === STEPS.length - 1 ? "text-foreground" : ""}>{step}</span>
            {i < STEPS.length - 1 ? <span aria-hidden>→</span> : null}
          </li>
        ))}
      </ol>
      <p className="mx-auto mt-10 max-w-lg text-center text-sm leading-relaxed text-muted-foreground">
        Retrieval is scoped to the current session. Chat messages are also embedded in the background, but that index is not read by any pipeline yet; answers are written from research sources.
      </p>
    </Section>
  );
}
