import { Section, SectionHeading } from "@/components/about/AboutPageShell";
import { ACCENT, STORY_FROM_CHAT } from "@/components/about/aboutStory";

/** Chat bubble on the left becomes a document on the right. viewBox 0 0 900 360 */
function Transformation() {
  const docLines = [70, 92, 114, 136, 158] as const;
  return (
    <svg
      viewBox="0 0 900 360"
      className="w-full text-foreground"
      role="img"
      aria-label="A chat bubble on the left becomes a story document with cited sources on the right"
    >
      {/* Bubble */}
      <g data-story-bubble>
        <path
          d="M60 60 h300 a16 16 0 0 1 16 16 v128 a16 16 0 0 1 -16 16 h-190 l-38 34 v-34 h-72 a16 16 0 0 1 -16 -16 v-128 a16 16 0 0 1 16 -16 z"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.6"
          strokeWidth="1"
        />
        <rect x="88" y="96" width="196" height="4" fill="currentColor" opacity="0.7" />
        <rect x="88" y="118" width="240" height="4" fill="currentColor" opacity="0.35" />
        <rect x="88" y="140" width="160" height="4" fill="currentColor" opacity="0.35" />
        <text className="hidden sm:block" x="88" y="196" fill="currentColor" opacity="0.6" fontSize="12" letterSpacing="1.6">
          CHAT
        </text>
      </g>

      {/* Transition */}
      <path
        data-about-draw
        d="M400 170 C 450 170, 470 180, 520 180"
        fill="none"
        stroke={ACCENT}
        strokeWidth="1.25"
      />
      <text className="hidden sm:block" x="460" y="158" textAnchor="middle" fill={ACCENT} fontSize="11" letterSpacing="2">
        CREATE STORY
      </text>

      {/* Document */}
      <g data-story-doc>
        <rect x="540" y="40" width="300" height="280" fill="none" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1" />
        <rect x="566" y="64" width="24" height="3" fill={ACCENT} />
        <rect data-story-line x="566" y="84" width="180" height="8" fill="currentColor" opacity="0.85" />
        {docLines.map((y, i) => (
          <rect
            key={y}
            data-story-line
            x="566"
            y={y + 40}
            width={i === docLines.length - 1 ? 150 : 248}
            height="3"
            fill="currentColor"
            opacity="0.3"
          />
        ))}
        <line x1="566" y1="228" x2="814" y2="228" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
        <text className="hidden sm:block" x="566" y="250" fill="currentColor" opacity="0.6" fontSize="10" letterSpacing="1.8">
          SOURCES
        </text>
        {[266, 282, 298].map((y) => (
          <g key={y}>
            <circle cx="570" cy={y - 1} r="2" fill={ACCENT} />
            <rect data-story-line x="580" y={y - 3} width={y === 298 ? 110 : 170} height="3" fill={ACCENT} opacity="0.5" />
          </g>
        ))}
      </g>
    </svg>
  );
}

export function StoryFlowSection() {
  return (
    <Section id="story">
      <SectionHeading
        eyebrow="From conversation to story"
        title="A question can become a document."
        lede="On a general chat—not a story deep dive—the determiner can hand the research it already gathered to a one-story pipeline. Nothing is searched twice for the same evidence."
      />

      <div data-about-story className="mt-20 lg:mt-28">
        <Transformation />
        <p className="mt-4 flex items-center justify-between text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase sm:hidden">
          <span>Chat</span>
          <span style={{ color: ACCENT }}>Create story</span>
          <span>Story</span>
        </p>
      </div>

      <ol data-about-reveal className="mt-16 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-6">
        {STORY_FROM_CHAT.map((stage, i) => (
          <li key={stage.id} data-about-item className="border-t border-border/40 pt-4">
            <p className="text-[0.7rem] tracking-[0.18em]" style={{ color: ACCENT }}>
              {String(i + 1).padStart(2, "0")}
            </p>
            <h3 className="font-display mt-2 text-xl font-normal">{stage.label}</h3>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted-foreground">{stage.detail}</p>
          </li>
        ))}
      </ol>

      <p className="mt-14 max-w-xl text-sm leading-relaxed text-muted-foreground">
        The result is a NewsStory you own. It stays a private draft until you
        publish it. You can edit the copy and upload a cover photo. After
        publishing, other readers can open it, vote on it, and deep-dive it.
        Only you can edit it.
      </p>
    </Section>
  );
}
