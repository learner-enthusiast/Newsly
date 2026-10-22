"use client";

import { Badge } from "@/components/ui/badge";
import type { PublishingKit } from "@/Agents/video/publishingKit/schema";
import { CopyButton } from "@/components/videoScript/CopyButton";
import { cn } from "@/lib/utils";

const TITLE_SOFT_LIMIT = 70;

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PublishingKitTab({ kit, hookOptions }: { kit: PublishingKit; hookOptions: string[] }) {
  const descriptions: Array<[string, string]> = [
    ["YouTube", kit.descriptions.youtube],
    ["Shorts", kit.descriptions.shorts],
    ["Instagram", kit.descriptions.instagram],
    [`X (${[...kit.descriptions.x].length}/280)`, kit.descriptions.x],
  ];

  return (
    <div className="flex flex-col gap-4">
      <Section title="Titles">
        <ul className="flex flex-col gap-2">
          {kit.titles.map((title) => (
            <li key={title.text} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{title.style.replace(/_/g, " ")}</Badge>
                {title.text}
              </span>
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "font-mono text-xs",
                    title.charCount > TITLE_SOFT_LIMIT ? "text-amber-600" : "text-muted-foreground",
                  )}
                >
                  {title.charCount}
                </span>
                <CopyButton text={title.text} size="xs" />
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Hook options">
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
          {hookOptions.map((hook, i) => (
            <li key={i}>{hook}</li>
          ))}
        </ol>
      </Section>

      <Section title="Thumbnail">
        <ul className="grid gap-3 sm:grid-cols-3">
          {kit.thumbnail.concepts.map((concept, i) => (
            <li key={i} className="flex flex-col gap-1 rounded-md bg-muted/50 p-3 text-sm">
              <span className="text-base font-bold uppercase">{concept.textOverlay}</span>
              <span>{concept.idea}</span>
              <span className="text-xs text-muted-foreground">{concept.layout}</span>
            </li>
          ))}
        </ul>
        {kit.thumbnail.openaiPrompts.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Background prompts (optional) — leave space for your face from a video frame.
            </p>
            {kit.thumbnail.openaiPrompts.map((prompt, i) => (
              <div key={i} className="flex flex-col gap-1.5 rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline">{prompt.size}</Badge>
                  <CopyButton text={prompt.prompt} size="xs" label="Copy prompt" />
                </div>
                <p>{prompt.prompt}</p>
                {prompt.notes ? <p className="text-xs text-muted-foreground">{prompt.notes}</p> : null}
              </div>
            ))}
          </div>
        ) : null}
        {kit.thumbnail.tips.length > 0 ? (
          <ul className="list-disc pl-5 text-xs text-muted-foreground">
            {kit.thumbnail.tips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        ) : null}
      </Section>

      {descriptions.map(([label, text]) => (
        <Section key={label} title={label} action={<CopyButton text={text} size="xs" />}>
          <p className="text-sm whitespace-pre-wrap">{text}</p>
        </Section>
      ))}

      <Section title="Hashtags" action={<CopyButton text={kit.hashtags.join(" ")} size="xs" />}>
        <p className="text-sm">{kit.hashtags.join(" ")}</p>
      </Section>

      <Section title="Pinned comment" action={<CopyButton text={kit.pinnedComment} size="xs" />}>
        <p className="text-sm">{kit.pinnedComment}</p>
      </Section>

      {kit.dropped.length > 0 ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">
            {kit.dropped.length} suggestion(s) removed for claiming more than the script says
          </summary>
          <ul className="mt-1 list-disc pl-4">
            {kit.dropped.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
