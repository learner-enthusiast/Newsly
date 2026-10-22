"use client";

import { Badge } from "@/components/ui/badge";
import type { FactSheet } from "@/Agents/video/researchBuilder/schema";
import type { FactCheck } from "@/Agents/video/factChecker/schema";
import type { Beat, ScriptOutput } from "@/Agents/video/scriptWriter/schema";
import { CopyButton } from "@/components/videoScript/CopyButton";
import { formatSeconds } from "@/components/videoScript/format";
import { cn } from "@/lib/utils";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

export function scriptToPlainText(script: ScriptOutput): string {
  const lines = [script.title, ""];
  for (const beat of script.beats) {
    lines.push(
      `[${beat.index + 1}] ${formatSeconds(beat.startSec)}–${formatSeconds(beat.endSec)}${beat.priority === "optional" ? " (optional)" : ""}`,
      beat.spokenText,
    );
    if (beat.onScreenText) {
      lines.push(`On screen: ${beat.onScreenText}`);
    }
    lines.push("");
  }
  if (script.disclaimer) {
    lines.push(script.disclaimer);
  }
  return lines.join("\n").trim();
}

const CHECK_LABEL: Record<string, { label: string; className: string }> = {
  ok: { label: "Checked", className: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400" },
  fixed: { label: "Fixed", className: "border-amber-500/40 text-amber-700 dark:text-amber-400" },
  removed_claim: { label: "Claim removed", className: "border-orange-500/40 text-orange-700 dark:text-orange-400" },
};

type ScriptTabProps = {
  script: ScriptOutput;
  factSheet: FactSheet | null;
  factCheck: FactCheck | null;
  onFactClick: (factId: string) => void;
  /** Later stages (direction, images, prompts) render per-beat extras here. */
  renderBeatExtras?: (beat: Beat) => ReactNode;
};

export function ScriptTab({ script, factSheet, factCheck, onFactClick, renderBeatExtras }: ScriptTabProps) {
  const checkByIndex = new Map(factCheck?.beats.map((check) => [check.index, check]) ?? []);
  const factById = new Map(factSheet?.facts.map((fact) => [fact.id, fact]) ?? []);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{script.title}</h2>
          {factCheck ? (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-sm",
                factCheck.passed ? "text-emerald-700 dark:text-emerald-400" : "text-destructive",
              )}
            >
              {factCheck.passed ? <ShieldCheck className="size-4" /> : <ShieldAlert className="size-4" />}
              {factCheck.passed ? "Fact check passed" : "Fact check found unresolved issues"}
              {factCheck.removedBeats.length > 0
                ? ` · ${factCheck.removedBeats.length} unsupported beat(s) removed`
                : ""}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">Fact check pending…</span>
          )}
        </div>
        <CopyButton text={scriptToPlainText(script)} label="Copy script" />
      </div>

      <section className="rounded-md border p-4">
        <h3 className="mb-2 text-sm font-medium">Hook options</h3>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
          {script.hookOptions.map((hook, i) => (
            <li key={i}>{hook}</li>
          ))}
        </ol>
      </section>

      <ol className="flex flex-col gap-3">
        {script.beats.map((beat) => {
          const check = checkByIndex.get(beat.index);
          const checkStyle = check ? CHECK_LABEL[check.status] : null;
          return (
            <li
              key={beat.index}
              className={cn(
                "flex flex-col gap-3 rounded-md border p-4",
                beat.priority === "optional" && "border-dashed",
              )}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono font-medium text-foreground">#{beat.index + 1}</span>
                <span className="font-mono">
                  {formatSeconds(beat.startSec)}–{formatSeconds(beat.endSec)}
                </span>
                <Badge variant="outline">{beat.kind}</Badge>
                {beat.priority === "optional" ? <Badge variant="secondary">optional</Badge> : null}
                {checkStyle ? (
                  <Badge variant="outline" className={checkStyle.className} title={check?.issues.join("\n")}>
                    {checkStyle.label}
                  </Badge>
                ) : null}
              </div>
              <p className="text-base leading-relaxed">{beat.spokenText}</p>
              {beat.onScreenText ? (
                <p className="text-sm">
                  <span className="text-muted-foreground">On screen: </span>
                  <span className="font-medium">{beat.onScreenText}</span>
                </p>
              ) : null}
              {beat.cutNote ? (
                <p className="text-xs text-muted-foreground">If cut: {beat.cutNote}</p>
              ) : null}
              {beat.factIds.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {beat.factIds.map((factId) => (
                    <button
                      key={factId}
                      type="button"
                      onClick={() => onFactClick(factId)}
                      title={factById.get(factId)?.text}
                      className="rounded-full border px-2 py-0.5 font-mono text-xs hover:bg-muted"
                    >
                      {factId}
                    </button>
                  ))}
                </div>
              ) : null}
              {check && check.issues.length > 0 ? (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Fact-check notes</summary>
                  <ul className="mt-1 list-disc pl-4">
                    {check.issues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {renderBeatExtras?.(beat)}
            </li>
          );
        })}
      </ol>

      {script.disclaimer ? (
        <p className="rounded-md bg-muted p-3 text-sm">{script.disclaimer}</p>
      ) : null}
    </div>
  );
}
