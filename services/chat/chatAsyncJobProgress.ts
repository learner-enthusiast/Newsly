export const CHAT_ASYNC_JOB_EXPECTED_MS = 3 * 60 * 1000;
export const CHAT_ASYNC_JOB_CATCH_UP_MS = 5_000;
export const CHAT_ASYNC_JOB_PENDING_CAP_MIN = 96;
export const CHAT_ASYNC_JOB_PENDING_CAP_MAX = 98;

export function parseChatJobCreatedAtMs(
  createdAt: string,
  fallbackMs: number,
): number {
  const parsed = Date.parse(createdAt);
  return Number.isFinite(parsed) ? parsed : fallbackMs;
}

export function pendingChatJobPercent(
  createdAtMs: number,
  nowMs: number,
  expectedMs: number = CHAT_ASYNC_JOB_EXPECTED_MS,
): { percent: number; overdue: boolean } {
  const elapsed = Math.max(0, nowMs - createdAtMs);
  if (elapsed >= expectedMs) {
    const wave = (Math.sin(nowMs / 8000) + 1) / 2;
    return {
      percent:
        CHAT_ASYNC_JOB_PENDING_CAP_MIN +
        wave * (CHAT_ASYNC_JOB_PENDING_CAP_MAX - CHAT_ASYNC_JOB_PENDING_CAP_MIN),
      overdue: true,
    };
  }
  return {
    percent: (elapsed / expectedMs) * CHAT_ASYNC_JOB_PENDING_CAP_MIN,
    overdue: false,
  };
}

export function catchUpChatJobPercent(
  fromPercent: number,
  startedAtMs: number,
  nowMs: number,
): number {
  const t = Math.min(
    1,
    Math.max(0, (nowMs - startedAtMs) / CHAT_ASYNC_JOB_CATCH_UP_MS),
  );
  return fromPercent + (100 - fromPercent) * t;
}
