export const NEWS_BRIEFING_EXPECTED_MS = 5 * 60 * 1000;
export const NEWS_BRIEFING_CATCH_UP_MS = 5_000;
export const NEWS_BRIEFING_PENDING_CAP_MIN = 96;
export const NEWS_BRIEFING_PENDING_CAP_MAX = 98;

export function parseNewsRequestCreatedAtMs(createdAt: string, fallbackMs: number): number {
  const parsed = Date.parse(createdAt);
  return Number.isFinite(parsed) ? parsed : fallbackMs;
}

export function pendingBriefingPercent(createdAtMs: number, nowMs: number): {
  percent: number;
  overdue: boolean;
} {
  const elapsed = Math.max(0, nowMs - createdAtMs);
  if (elapsed >= NEWS_BRIEFING_EXPECTED_MS) {
    const wave = (Math.sin(nowMs / 8000) + 1) / 2;
    return {
      percent:
        NEWS_BRIEFING_PENDING_CAP_MIN +
        wave * (NEWS_BRIEFING_PENDING_CAP_MAX - NEWS_BRIEFING_PENDING_CAP_MIN),
      overdue: true,
    };
  }
  return {
    percent: (elapsed / NEWS_BRIEFING_EXPECTED_MS) * NEWS_BRIEFING_PENDING_CAP_MIN,
    overdue: false,
  };
}

export function catchUpBriefingPercent(fromPercent: number, startedAtMs: number, nowMs: number): number {
  const t = Math.min(1, Math.max(0, (nowMs - startedAtMs) / NEWS_BRIEFING_CATCH_UP_MS));
  return fromPercent + (100 - fromPercent) * t;
}
