import type { NewsRequestStatus } from "@/services/news/newsRequestTypes";

/** Keep polling while the backend status is `pending` (in-flight generation). */
export function shouldScheduleNextPoll(status: NewsRequestStatus): boolean {
  return status === "pending";
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
