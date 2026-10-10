"use client";

import { cn } from "@/lib/utils";

type LoadingLogLinesProps = {
  loadingLogs: string[];
  busy?: boolean;
  className?: string;
};

function logLineStates(
  loadingLogs: string[],
  busy: boolean,
): Array<"done" | "active" | "pending"> {
  if (loadingLogs.length === 0) {
    return [];
  }
  return loadingLogs.map((_, index) => {
    if (!busy) {
      return "done" as const;
    }
    if (index < loadingLogs.length - 1) {
      return "done" as const;
    }
    return "active" as const;
  });
}

export function LoadingLogLines({
  loadingLogs,
  busy = true,
  className,
}: LoadingLogLinesProps) {
  if (loadingLogs.length === 0) {
    return null;
  }

  const states = logLineStates(loadingLogs, busy);

  return (
    <ol
      className={cn("flex flex-col gap-2", className)}
      aria-live="polite"
    >
      {loadingLogs.map((line, index) => {
        const state = states[index] ?? "pending";
        const icon =
          state === "done" ? "✓" : state === "active" ? "●" : "○";
        return (
          <li
            key={`${index}-${line}`}
            className={cn(
              "text-sm",
              state === "active"
                ? "font-medium text-foreground"
                : state === "done"
                  ? "text-foreground"
                  : "text-muted-foreground",
            )}
          >
            <span aria-hidden>{icon}</span> {line}
          </li>
        );
      })}
    </ol>
  );
}
