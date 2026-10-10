import type { NewsRequestStatus } from "@/services/news/newsRequestTypes";

/** Keep polling while generation or an incremental rerun is in flight. */
export function shouldScheduleNextPoll(input: {
  status: NewsRequestStatus;
  isRerunning: boolean;
}): boolean {
  return input.status === "pending" || input.isRerunning === true;
}

/** Stop polling and surface a hard error (missing request or auth). */
export function isFatalPollError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("not found") ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden")
  );
}
