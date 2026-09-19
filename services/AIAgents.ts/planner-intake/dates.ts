import type { FestivalDates } from "./schema";

export type CalendarDay = {
  year: number;
  month: number;
  day: number;
};

export function todayFromClock(now = new Date()): CalendarDay {
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

export function compareIsoDate(left: string, right: string) {
  return left.localeCompare(right);
}

export function isoFromCalendarDay({ year, month, day }: CalendarDay) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function festivalHasEnded(
  festivalDates: Pick<FestivalDates, "end">,
  today: CalendarDay,
) {
  return compareIsoDate(festivalDates.end, isoFromCalendarDay(today)) < 0;
}

export function inclusiveDayCount(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const diff = endDate.getTime() - startDate.getTime();

  if (Number.isNaN(diff) || diff < 0) {
    return null;
  }

  return Math.floor(diff / 86_400_000) + 1;
}

export function visitDatesWithinFestival(
  visitDates: string[],
  festivalDates: Pick<FestivalDates, "start" | "end">,
) {
  return visitDates.every(
    (date) =>
      compareIsoDate(date, festivalDates.start) >= 0 &&
      compareIsoDate(date, festivalDates.end) <= 0,
  );
}
