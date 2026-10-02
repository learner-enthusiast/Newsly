"use client";

import {
  deriveProgressSteps,
  type NewsProgressStepView,
} from "@/services/news/newsRequestProgress";

type NewsRequestProgressProps = {
  loadingLogs: string[];
  status: "pending" | "failed" | "success";
  isRerunning?: boolean;
  title?: string;
};

function StepIcon({ state }: { state: NewsProgressStepView["state"] }) {
  if (state === "done") {
    return <span aria-hidden>✓</span>;
  }
  if (state === "active") {
    return <span aria-hidden>●</span>;
  }
  return <span aria-hidden>○</span>;
}

export function NewsRequestProgress({
  loadingLogs,
  status,
  isRerunning = false,
  title = "Generating your news briefing",
}: NewsRequestProgressProps) {
  const steps = deriveProgressSteps(loadingLogs, status, isRerunning);

  return (
    <section
      className="rounded-md border border-dashed p-4"
      aria-busy={status === "pending"}
      aria-live="polite"
    >
      <h2 className="text-sm font-medium">{title}</h2>
      <ol className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
        {steps.map((step) => (
          <li
            key={step.id}
            className={
              step.state === "active"
                ? "font-medium text-foreground"
                : step.state === "done"
                  ? "text-foreground"
                  : undefined
            }
          >
            <StepIcon state={step.state} /> {step.id}
          </li>
        ))}
      </ol>
    </section>
  );
}
