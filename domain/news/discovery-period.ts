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

export function resolveDiscoveryDateRange(input: {
  period: DiscoveryPeriod;
  startDate?: Date;
  endDate?: Date;
  anchorDate?: Date;
}): DateRange {
  if (input.startDate && input.endDate) {
    return {
      startDate: startOfUtcDay(input.startDate),
      endDate: startOfUtcDay(input.endDate),
    };
  }
  return dateRangeForDiscoveryPeriod(
    input.period,
    input.anchorDate ?? new Date(),
  );
}

/** Format for `<input type="date">` (UTC calendar day). */
export function formatDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}
