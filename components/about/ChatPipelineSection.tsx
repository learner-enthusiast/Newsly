import { Section, SectionHeading } from "@/components/about/AboutPageShell";
import { ACCENT, CHAT_PIPELINE } from "@/components/about/aboutStory";

function ConversationFragment() {
  return (
    <figure className="max-w-md" aria-label="A research chat: a question, then an answer with sources">
      <p className="text-[0.7rem] tracking-[0.2em] text-muted-foreground uppercase">In a session</p>
      <blockquote className="font-display mt-6 text-3xl leading-[1.15] text-balance sm:text-4xl">
        “What changed in this story since yesterday?”
      </blockquote>
      <div className="mt-10 border-l pl-6" style={{ borderColor: ACCENT }}>
        <p className="text-sm leading-relaxed text-foreground/85">
          Two of the four sources already in this session cover the change. One
          new report was added after a targeted search. Here is what moved, and
          what did not.
        </p>
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <li>reuters.com</li>
          <li>ft.com</li>
          <li>youtube.com/watch…</li>
        </ul>
      </div>
      <figcaption className="mt-8 text-sm leading-relaxed text-muted-foreground">
        The first turn of a deep dive starts from the story and its stored
        sources instead of a fresh search plan. Every turn after that runs this
        same process. Conversation text is context for the model; it is never
        cited as a source.
      </figcaption>
    </figure>
  );
}

export function ChatPipelineSection() {
  return (
    <Section id="chat">
      <SectionHeading
        eyebrow="Conversational research"
        title={
          <>
            Ask a question.
            {" "}<br className="hidden sm:block" />
            The system researches it.
          </>
        }
        lede="Chat is narrower than a briefing. It reuses this session's research when similarity is high enough, and it searches only when the determiner says the record is not enough."
      />

      <div className="mt-20 grid gap-16 lg:mt-28 lg:grid-cols-2 lg:gap-24">
        <ConversationFragment />

        <ol data-about-reveal className="relative">
          <span className="absolute top-3 bottom-3 left-[5px] w-px bg-border/60" aria-hidden />
          {CHAT_PIPELINE.map((stage, i) => {
            const last = i === CHAT_PIPELINE.length - 1;
            return (
              <li key={stage.id} data-about-item className="relative grid grid-cols-[1.75rem_1fr] gap-4 py-5">
                <span
                  className="relative z-10 mt-2 size-[11px] rounded-full border bg-background"
                  style={{ borderColor: last ? ACCENT : "var(--foreground)", backgroundColor: last ? ACCENT : undefined }}
                  aria-hidden
                />
                <div>
                  <h3 className="font-display text-2xl font-normal">{stage.label}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{stage.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </Section>
  );
}
