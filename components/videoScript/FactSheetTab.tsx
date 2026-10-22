"use client";

import { Badge } from "@/components/ui/badge";
import type { FactSheet } from "@/Agents/video/researchBuilder/schema";
import { cn } from "@/lib/utils";
import { AlertTriangle, ExternalLink } from "lucide-react";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function factAnchorId(factId: string) {
  return `fact-${factId}`;
}

export function FactSheetTab({
  factSheet,
  highlightFactId,
}: {
  factSheet: FactSheet;
  highlightFactId: string | null;
}) {
  const conflicted = new Set(factSheet.conflicts.flatMap((c) => [c.factA, c.factB]));

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">What happened</h2>
        <p className="text-sm leading-relaxed">{factSheet.whatHappened}</p>
        {factSheet.whatChanged ? (
          <p className="text-sm leading-relaxed">
            <span className="font-medium">What changed: </span>
            {factSheet.whatChanged}
          </p>
        ) : null}
      </section>

      {factSheet.conflicts.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-md border border-amber-500/50 bg-amber-500/5 p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-4" />
            Sources disagree
          </h3>
          <ul className="flex flex-col gap-1 text-sm">
            {factSheet.conflicts.map((conflict, i) => (
              <li key={i}>
                <a className="font-mono underline" href={`#${factAnchorId(conflict.factA)}`}>
                  {conflict.factA}
                </a>{" "}
                vs{" "}
                <a className="font-mono underline" href={`#${factAnchorId(conflict.factB)}`}>
                  {conflict.factB}
                </a>
                : {conflict.note}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Facts ({factSheet.facts.length})</h3>
        <ol className="flex flex-col gap-2">
          {factSheet.facts.map((fact) => (
            <li
              key={fact.id}
              id={factAnchorId(fact.id)}
              className={cn(
                "scroll-mt-24 rounded-md border p-3 text-sm",
                conflicted.has(fact.id) && "border-amber-500/60",
                highlightFactId === fact.id && "ring-2 ring-primary",
              )}
            >
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono font-medium text-foreground">{fact.id}</span>
                <Badge variant="outline">{fact.type}</Badge>
                <Badge variant={fact.confidence === "high" ? "secondary" : "outline"}>
                  {fact.confidence}
                </Badge>
                {conflicted.has(fact.id) ? (
                  <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
                    conflict
                  </Badge>
                ) : null}
              </div>
              <p>{fact.text}</p>
              {fact.type === "quote" && fact.value ? (
                <blockquote className="mt-1 border-l-2 pl-3 italic">
                  “{fact.value}”{fact.speaker ? ` — ${fact.speaker}` : ""}
                </blockquote>
              ) : null}
              {fact.sourceUrls.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {fact.sourceUrls.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      {hostOf(url)}
                      <ExternalLink className="size-3" />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">From the story text</p>
              )}
            </li>
          ))}
        </ol>
      </section>

      {[
        ["Why it matters", factSheet.whyItMatters],
        ["Who is affected", factSheet.whoIsAffected],
        ["Open questions", factSheet.openQuestions],
      ].map(([title, items]) =>
        (items as string[]).length > 0 ? (
          <section key={title as string} className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{title as string}</h3>
            <ul className="list-disc pl-5 text-sm">
              {(items as string[]).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null,
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Sources</h3>
        <ul className="flex flex-col gap-1 text-sm">
          {factSheet.sources
            .filter((source) => source.origin !== "story")
            .map((source) => (
              <li key={source.id} className="flex items-center gap-2">
                {source.origin === "search" ? <Badge variant="outline">found by search</Badge> : null}
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {source.title || hostOf(source.url)}
                </a>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
