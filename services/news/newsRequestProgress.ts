import type { NewsScope } from "@/lib/newsScope";

export const NEWS_PROGRESS_STEPS = [
  "Preparing your request",
  "Finding relevant stories",
  "Checking sources",
  "Organizing the news",
  "Preparing your briefing",
] as const;

export type NewsProgressStepId = (typeof NEWS_PROGRESS_STEPS)[number];

/** User-facing log lines written by the API/pipeline (not internal step names). */
export const USER_FACING_LOG_MARKERS: Array<{
  logIncludes: string;
  completedThroughStep: number;
}> = [
  { logIncludes: "Request accepted", completedThroughStep: 0 },
  { logIncludes: "Pipeline started", completedThroughStep: 0 },
  { logIncludes: "Manual retry", completedThroughStep: 0 },
  { logIncludes: "Retrying failed", completedThroughStep: 0 },
  { logIncludes: "Search queries planned", completedThroughStep: 1 },
  { logIncludes: "Finding relevant stories", completedThroughStep: 1 },
  { logIncludes: "Reading and checking articles", completedThroughStep: 2 },
  { logIncludes: "Checking sources", completedThroughStep: 2 },
  { logIncludes: "Organizing the news", completedThroughStep: 3 },
  { logIncludes: "Preparing your briefing", completedThroughStep: 4 },
];

export type NewsProgressStepState = "done" | "active" | "pending";

export type NewsProgressStepView = {
  id: NewsProgressStepId;
  state: NewsProgressStepState;
};

export function activeProgressStepLabel(
  loadingLogs: string[] | undefined,
  status: "pending" | "failed" | "success",
): NewsProgressStepId | null {
  const steps = deriveProgressSteps(loadingLogs, status);
  return steps.find((step) => step.state === "active")?.id ?? null;
}

export function deriveProgressSteps(
  loadingLogs: string[] | undefined,
  status: "pending" | "failed" | "success",
): NewsProgressStepView[] {
  let maxCompleted = -1;
  for (const line of loadingLogs ?? []) {
    const normalized = line.toLowerCase();
    for (const marker of USER_FACING_LOG_MARKERS) {
      if (normalized.includes(marker.logIncludes.toLowerCase())) {
        maxCompleted = Math.max(maxCompleted, marker.completedThroughStep);
      }
    }
  }

  if (status === "success") {
    maxCompleted = NEWS_PROGRESS_STEPS.length - 1;
  }

  const activeIndex =
    status === "pending"
      ? Math.min(maxCompleted + 1, NEWS_PROGRESS_STEPS.length - 1)
      : -1;

  return NEWS_PROGRESS_STEPS.map((id, index) => {
    if (status === "success" || index <= maxCompleted) {
      return { id, state: "done" as const };
    }
    if (index === activeIndex) {
      return { id, state: "active" as const };
    }
    return { id, state: "pending" as const };
  });
}

export function formatNewsScopeLabel(scope: NewsScope | string): string {
  switch (scope) {
    case "local":
      return "Local";
    case "world":
      return "World";
    case "both":
      return "Local + world";
    default:
      return scope;
  }
}

export function formatNewsRequestStatusLabel(
  status: "pending" | "failed" | "success",
): string {
  switch (status) {
    case "pending":
      return "In progress";
    case "success":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

export function formatDisplayDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function sanitizeNewsRequestError(raw: string | null | undefined): string {
  if (!raw?.trim()) {
    return "Something went wrong while generating your briefing.";
  }
  const message = raw.trim();
  if (/^\s*at\s+/m.test(message) || message.includes("stack trace")) {
    return "Something went wrong while generating your briefing.";
  }
  if (message.length > 280) {
    return `${message.slice(0, 277)}…`;
  }
  return message;
}

export type NewsRequestSummaryFields = {
  date: string;
  scope: string;
  location: string | null;
  categories: string[];
  storyCount: number;
  customQuery?: string | null;
  language?: string | null;
  sources?: string[];
};

export function formatNewsRequestSummaryLines(
  request: NewsRequestSummaryFields,
): string[] {
  const lines = [
    formatDisplayDate(request.date),
    formatNewsScopeLabel(request.scope),
  ];
  if (request.location?.trim()) {
    lines.push(request.location.trim());
  }
  if (request.categories.length > 0) {
    lines.push(request.categories.join(", "));
  }
  lines.push(
    `${request.storyCount} ${request.storyCount === 1 ? "story" : "stories"}`,
  );
  return lines;
}
