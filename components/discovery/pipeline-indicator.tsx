"use client";

import { cn } from "@/lib/utils";
import {
  parseDiscoveryRunMetadata,
  type DiscoveryRunMetadata,
} from "@/domain/news/pipeline-metadata";
import type { PipelineStage } from "@/domain/news/types/pipeline";

const STAGE_LABELS: Record<PipelineStage, string> = {
  discovery: "Discovery",
  document_ingest: "Documents",
  document_understand: "Understanding",
  event_process: "Events",
  evidence_process: "Evidence",
  ranking_primary: "Ranking",
  ranking_independent: "Ranking",
  ranking_coverage: "Ranking",
  ranking_final: "Final",
};

/** User-facing steps (collapses ranking substages). */
const DISPLAY_STAGES = [
  "discovery",
  "document_ingest",
  "document_understand",
  "event_process",
  "evidence_process",
  "ranking_primary",
  "ranking_final",
] as const;

type DisplayStage = (typeof DISPLAY_STAGES)[number];

const DISPLAY_LABELS: Record<DisplayStage, string> = {
  discovery: "Discovery",
  document_ingest: "Documents",
  document_understand: "Understanding",
  event_process: "Events",
  evidence_process: "Evidence",
  ranking_primary: "Ranking",
  ranking_final: "Final",
};

function displayStageIndex(stage: PipelineStage): number {
  if (stage === "ranking_independent" || stage === "ranking_coverage") {
    return DISPLAY_STAGES.indexOf("ranking_primary");
  }
  return DISPLAY_STAGES.indexOf(stage as DisplayStage);
}

type StageVisualState = "complete" | "active" | "pending" | "failed";

function stageStates(input: {
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  metadata: unknown;
}): StageVisualState[] {
  const meta = parseDiscoveryRunMetadata(input.metadata);

  if (input.status === "FAILED") {
    return DISPLAY_STAGES.map((_, index) =>
      index === 0 ? "failed" : "pending",
    );
  }

  if (input.status === "COMPLETED") {
    return DISPLAY_STAGES.map(() => "complete");
  }

  if (input.status === "PENDING") {
    return DISPLAY_STAGES.map(() => "pending");
  }

  // RUNNING — only mark stages complete when metadata says so.
  if (meta.pipelineStage) {
    const current = displayStageIndex(meta.pipelineStage);
    return DISPLAY_STAGES.map((_, index) => {
      if (index < current) {
        return "complete";
      }
      if (index === current) {
        return "active";
      }
      return "pending";
    });
  }

  return DISPLAY_STAGES.map(() => "pending");
}

export type DiscoveryPipelineIndicatorProps = {
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  metadata: unknown;
  className?: string;
};

export function DiscoveryPipelineIndicator({
  status,
  metadata,
  className,
}: DiscoveryPipelineIndicatorProps) {
  const meta: DiscoveryRunMetadata = parseDiscoveryRunMetadata(metadata);
  const states = stageStates({ status, metadata });

  const showBackgroundProcessing =
    status === "RUNNING" && !meta.pipelineStage;

  return (
    <div className={cn("space-y-3", className)}>
      {showBackgroundProcessing ? (
        <p className="text-sm text-muted-foreground">
          Processing in background. Stage progress will appear here when the
          pipeline reports it.
        </p>
      ) : null}
      <ol className="flex flex-wrap gap-2 text-xs sm:gap-3">
        {DISPLAY_STAGES.map((stage, index) => {
          const state = states[index];
          return (
            <li key={stage} className="flex items-center gap-2">
              {index > 0 ? (
                <span className="text-muted-foreground/50" aria-hidden>
                  →
                </span>
              ) : null}
              <span
                className={cn(
                  "rounded-md border px-2 py-1 font-medium",
                  state === "complete" &&
                    "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
                  state === "active" &&
                    "border-primary/50 bg-primary/10 text-foreground",
                  state === "pending" &&
                    "border-border/60 bg-muted/40 text-muted-foreground",
                  state === "failed" &&
                    "border-destructive/50 bg-destructive/10 text-destructive",
                )}
              >
                {DISPLAY_LABELS[stage]}
              </span>
            </li>
          );
        })}
      </ol>
      {meta.failureReason ? (
        <p className="text-sm text-destructive">{meta.failureReason}</p>
      ) : null}
    </div>
  );
}

/** @internal exported for tests */
export { STAGE_LABELS, DISPLAY_STAGES, stageStates };
