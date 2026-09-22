import type { DiscoveryPeriod } from "@/db/generated/client";
import type { DateRange } from "@/domain/news/types/pipeline";

function startOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function dateRangeForDiscoveryPeriod(
  period: DiscoveryPeriod,
  anchorDate: Date = new Date(),
): DateRange {
  const end = startOfUtcDay(anchorDate);
  const start =
    period === "DAY"
      ? end
      : period === "WEEK"
        ? addUtcDays(end, -6)
        : addUtcDays(end, -29);

  return { startDate: start, endDate: end };
}
