import { DateTime, type DateTime as DateTimeType } from "luxon";
import type { NewsletterFrequency } from "@/db/generated/client";

export type ScheduleInput = {
  frequency: NewsletterFrequency;
  sendTimeLocal: string;
  timezone: string;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  from?: Date;
};

function parseSendTime(sendTimeLocal: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(sendTimeLocal.trim());
  if (!match) {
    throw new Error("sendTimeLocal must be HH:mm");
  }
  const hour = Number.parseInt(match[1]!, 10);
  const minute = Number.parseInt(match[2]!, 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error("sendTimeLocal out of range");
  }
  return { hour, minute };
}

function isWeekday(dt: DateTime): boolean {
  return dt.weekday >= 1 && dt.weekday <= 5;
}

function clampMonthlyDay(base: DateTime, dayOfMonth: number): DateTime {
  const day = Math.min(Math.max(dayOfMonth, 1), base.daysInMonth ?? dayOfMonth);
  return base.set({ day });
}

/** Next UTC instant when a newsletter should run (timezone/DST aware). */
export function computeNextRun(input: ScheduleInput): Date {
  const zone = input.timezone;
  if (!DateTime.now().setZone(zone).isValid) {
    throw new Error("Invalid timezone");
  }
  const { hour, minute } = parseSendTime(input.sendTimeLocal);
  const from = DateTime.fromJSDate(input.from ?? new Date(), { zone });

  let candidate: DateTimeType = from.set({
    hour,
    minute,
    second: 0,
    millisecond: 0,
  });
  if (candidate <= from) {
    candidate = candidate.plus({ days: 1 });
  }

  for (let guard = 0; guard < 400; guard++) {
    if (input.frequency === "WEEKDAYS") {
      while (!isWeekday(candidate)) {
        candidate = candidate.plus({ days: 1 });
      }
    }

    if (input.frequency === "WEEKLY") {
      const target = input.dayOfWeek ?? 1;
      while (candidate.weekday !== target) {
        candidate = candidate.plus({ days: 1 });
      }
      candidate = candidate.set({
        hour,
        minute,
        second: 0,
        millisecond: 0,
      });
    }

    if (input.frequency === "MONTHLY") {
      const dom = input.dayOfMonth ?? 1;
      candidate = clampMonthlyDay(candidate.startOf("month"), dom).set({
        hour,
        minute,
        second: 0,
        millisecond: 0,
      }) as DateTimeType;
      if (candidate <= from) {
        candidate = clampMonthlyDay(
          candidate.plus({ months: 1 }).startOf("month"),
          dom,
        ).set({ hour, minute, second: 0, millisecond: 0 }) as DateTimeType;
      }
    } else if (
      input.frequency === "DAILY" ||
      input.frequency === "WEEKDAYS"
    ) {
      candidate = candidate.set({
        hour,
        minute,
        second: 0,
        millisecond: 0,
      });
    }

    if (candidate > from) {
      return candidate.toUTC().toJSDate();
    }

    candidate = candidate.plus({ days: 1 });
  }

  throw new Error("computeNextRun: could not find next run within horizon");
}

export type NewsWindow = {
  date: string;
  periodKey: string;
  windowStart: Date;
  windowEnd: Date;
};

/** Calendar window for shared edition content for a scheduled send. */
export function newsWindow(
  scheduledFor: Date,
  timezone: string,
  frequency: NewsletterFrequency,
): NewsWindow {
  const zoned = DateTime.fromJSDate(scheduledFor, { zone: timezone });
  const date = zoned.toISODate();
  if (!date) {
    throw new Error("Invalid scheduledFor for newsWindow");
  }

  const windowStart = zoned.startOf("day").toUTC().toJSDate();
  const windowEnd = zoned.endOf("day").toUTC().toJSDate();
  const periodKey =
    frequency === "MONTHLY"
      ? zoned.toFormat("yyyy-MM")
      : frequency === "WEEKLY"
        ? `${zoned.weekYear}-W${String(zoned.weekNumber).padStart(2, "0")}`
        : date;

  return { date, periodKey, windowStart, windowEnd };
}
