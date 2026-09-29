import { LandingBlock, LandingEyebrow } from "@/components/landing/LandingBlock";
import { CHAT_TURNS } from "@/components/landing/homeStory";
import { GetStartedButton } from "@/components/landing/GetStartedButton";

export function ConversationalResearch() {
  return (
    <LandingBlock id="ask">
      <div className="grid items-start gap-16 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
        <div>
          <LandingEyebrow>One question can become a session</LandingEyebrow>
          <h2 className="font-display mt-5 text-4xl leading-[1.05] font-normal tracking-tight text-balance sm:text-5xl">
            Ask once. Then keep digging.
          </h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
            A follow-up stays in the same conversation. If the session already read something useful, Newsly uses it before searching again.
          </p>
          <div className="mt-8">
            <GetStartedButton label="Ask your first question" />
          </div>
        </div>

        <div aria-label="Illustration of a research conversation">
          <p className="text-[0.7rem] tracking-[0.18em] text-muted-foreground uppercase">
            Illustration of a session
          </p>
          <ol className="mt-6 flex flex-col gap-4 overflow-x-hidden" data-chat-turns>
            {CHAT_TURNS.map((turn) =>
              turn.role === "user" ? (
                <li key={turn.text} data-chat-turn="user" className="flex justify-end">
                  <p className="max-w-[min(100%,28rem)] rounded-2xl rounded-br-md bg-[#c85d3f] px-4 py-3 text-sm leading-relaxed text-white">
                    {turn.text}
                  </p>
                </li>
              ) : (
                <li key={turn.text} data-chat-turn="agent" className="flex justify-start">
                  <p className="max-w-[min(100%,32rem)] rounded-2xl rounded-bl-md border border-border/60 bg-card px-4 py-3 text-sm leading-relaxed">
                    {turn.text}
                  </p>
                </li>
              ),
            )}
          </ol>
        </div>
      </div>
    </LandingBlock>
  );
}
