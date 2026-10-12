/**
 * Usage reporting buckets days in Asia/Kolkata (rows are stored in UTC).
 * IST has no DST, but luxon keeps this honest if that ever changes.
 */

import { DateTime } from "luxon";

export const USAGE_TIME_ZONE = "Asia/Kolkata";

function ist(now: Date): DateTime {
  return DateTime.fromJSDate(now, { zone: USAGE_TIME_ZONE });
}

/** UTC instant of 00:00 IST today. */
export function istDayStart(now: Date = new Date()): Date {
  return ist(now).startOf("day").toJSDate();
}

/** UTC instant of 00:00 IST on the 1st of this month. */
export function istMonthStart(now: Date = new Date()): Date {
  return ist(now).startOf("month").toJSDate();
}

/** UTC instant of 00:00 IST, `days` days before today (0 = today). */
export function istDaysAgoStart(days: number, now: Date = new Date()): Date {
  return ist(now).startOf("day").minus({ days }).toJSDate();
}

/** IST calendar date, "YYYY-MM-DD". */
export function istDateKey(date: Date): string {
  return ist(date).toISODate() ?? date.toISOString().slice(0, 10);
}

/** The last `count` IST dates ending today, oldest first. */
export function istLastDateKeys(count: number, now: Date = new Date()): string[] {
  const today = ist(now).startOf("day");
  return Array.from({ length: count }, (_, index) =>
    today.minus({ days: count - 1 - index }).toISODate() ?? "",
  );
}
