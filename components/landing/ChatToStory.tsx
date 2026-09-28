import { LandingBlock, LandingEyebrow } from "@/components/landing/LandingBlock";
import { ACCENT } from "@/components/landing/homeStory";
import { GetStartedButton } from "@/components/landing/GetStartedButton";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const BECOMES = [
  { label: "Question", detail: "You ask in a conversation." },
  { label: "Research", detail: "The pages that were read stay on the session." },
  { label: "Story", detail: "Ask for a story and it becomes a draft you own." },
  { label: "Yours", detail: "Edit it. Publish it when you want other people to read it." },
] as const;

export function ChatToStory() {
  return (
    <LandingBlock id="keep">
      <div className="grid items-start gap-16 lg:grid-cols-2 lg:gap-24">
        <div>
          <LandingEyebrow>Research doesn&apos;t have to disappear</LandingEyebrow>
          <h2 className="font-display mt-5 text-4xl leading-[1.05] font-normal tracking-tight text-balance sm:text-5xl">
            A conversation can become something you keep.
          </h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
            When you ask for a story, Newsly writes it from the research already gathered, then fills only the gaps. The draft is private until you publish it.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <GetStartedButton label="Start researching" />
            <Button
              variant="outline"
              size="lg"
              className="rounded-full"
              nativeButton={false}
              render={<Link href="/newsStory" />}
            >
              Explore Newsly
            </Button>
          </div>
        </div>

        <ol>
          {BECOMES.map((step, i) => (
            <li key={step.label} className="grid grid-cols-[4.5rem_1fr] gap-4 border-t border-border/40 py-6">
              <span className="font-display text-3xl" style={{ color: i === BECOMES.length - 1 ? ACCENT : undefined }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="font-display text-2xl font-normal">{step.label}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </LandingBlock>
  );
}
