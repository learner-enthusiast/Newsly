import type { NewsStoryStatus } from "@/services/news/newsRequestTypes";

export const NEWS_STORY_POLL_MS = 5000;

const TERMINAL_STORY_STATUSES = new Set<NewsStoryStatus>([
  "READY",
  "FAILED",
  "DRAFT",
  "PUBLISHED",
  "ARCHIVED",
]);

export function shouldPollNewsStoryStatus(status: NewsStoryStatus | undefined): boolean {
  if (!status) {
    return false;
  }
  return status === "PENDING";
}

export function isTerminalNewsStoryStatus(status: NewsStoryStatus): boolean {
  return TERMINAL_STORY_STATUSES.has(status);
}
