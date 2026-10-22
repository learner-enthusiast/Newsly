"use client";

import { cn } from "@/lib/utils";
import {
  resolveStageStates,
  VIDEO_SCRIPT_STAGES,
} from "@/services/videoScript/videoScriptTypes";
import { Check, Loader2 } from "lucide-react";

export function VideoScriptStepper({ status }: { status: string }) {
  const states = resolveStageStates(status);

  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Progress">
      {VIDEO_SCRIPT_STAGES.map((stage, index) => {
        const state = states[index];
        return (
          <li
            key={stage.status}
            aria-current={state === "active" ? "step" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
              state === "complete" && "border-primary/40 text-foreground",
              state === "active" && "border-primary bg-primary/5 font-medium",
              state === "pending" && "text-muted-foreground",
            )}
          >
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full border text-xs">
              {state === "complete" ? (
                <Check className="size-3.5" />
              ) : state === "active" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                index + 1
              )}
            </span>
            {stage.label}
          </li>
        );
      })}
    </ol>
  );
}
