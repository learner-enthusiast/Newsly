"use client";

import { LandingBlock, LandingEyebrow } from "@/components/landing/LandingBlock";
import { ASK_PROMPTS } from "@/components/landing/homeStory";
import { GetStartedButton } from "@/components/landing/GetStartedButton";
import { useState } from "react";

export function AskSection() {
  const [active, setActive] = useState(0);
  const question = ASK_PROMPTS[active] ?? ASK_PROMPTS[0];

  return (
    <LandingBlock id="try">
      <LandingEyebrow>Start with a question</LandingEyebrow>
      <h2 className="font-display mt-5 max-w-3xl text-4xl leading-[1.05] font-normal tracking-tight text-balance sm:text-5xl">
        You already have something you want to understand.
      </h2>
      <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
        These are the kinds of questions Newsly is built for: markets, policy, companies, and the economy. Not tips. Not a verdict.
      </p>

      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] lg:items-end">
        <div className="flex flex-col gap-3">
          {ASK_PROMPTS.map((prompt, index) => {
            const selected = index === active;
            return (
              <button
                key={prompt}
                type="button"
                aria-pressed={selected}
                onClick={() => setActive(index)}
                className={`border-t py-4 text-left text-lg transition-colors sm:text-xl ${
                  selected ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {prompt}
              </button>
            );
          })}
        </div>

        <div>
          <p className="text-[0.7rem] tracking-[0.18em] text-muted-foreground uppercase">
            Your question
          </p>
          <p className="font-display mt-4 text-3xl leading-snug text-balance">{question}</p>
          <div className="mt-8">
            <GetStartedButton label="Ask Newsly" />
          </div>
        </div>
      </div>
    </LandingBlock>
  );
}
