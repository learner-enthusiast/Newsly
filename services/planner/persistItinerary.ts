import { createPlanDay, getPlanDaysByPlanId } from "@/repositories/planDay";
import { createPlanItem, getPlanItemsByDayId } from "@/repositories/planItem";
import {
  placeSnapshot,
  type CanonicalPlace,
} from "@/services/planner/canonicalPlace";
import type { DayRoute } from "@/services/planner/dayRoutes";

export type PersistableDay = {
  route: DayRoute;
  title: string;
  description: string;
  /** Per-stop copy from the itinerary agent, keyed by route position. */
  stopNotes?: Array<{ position: number; note: string }>;
};

/** `@db.Time` columns take a Date; only the clock part is stored. */
function timeOfDay(minutes: number | null) {
  if (minutes == null) {
    return null;
  }

  const clamped = Math.max(0, Math.min(minutes, 24 * 60 - 1));

  return new Date(
    Date.UTC(1970, 0, 1, Math.floor(clamped / 60), clamped % 60, 0, 0),
  );
}

/**
 * Writes days and items for a validated route.
 *
 * Idempotent per day: a day that already has items is left untouched so an
 * Inngest retry cannot duplicate an itinerary.
 */
export async function persistPlanDaysAndItems(params: {
  planId: string;
  days: PersistableDay[];
  places: CanonicalPlace[];
}) {
  const existingDays = await getPlanDaysByPlanId(params.planId);
  const canonicalById = new Map(params.places.map((place) => [place.id, place]));
  const existingByNumber = new Map(
    existingDays.map((day) => [day.dayNumber, day]),
  );

  const persistedDays = [];

  for (const day of params.days) {
    const existing = existingByNumber.get(day.route.dayNumber);
    const planDay =
      existing ??
      (await createPlanDay({
        planId: params.planId,
        dayNumber: day.route.dayNumber,
        date: day.route.date ? new Date(`${day.route.date}T00:00:00.000Z`) : null,
        title: day.title,
        description: day.description,
        startTime: timeOfDay(day.route.startMinutes),
        endTime: timeOfDay(day.route.endMinutes),
      }));

    const existingItems = await getPlanItemsByDayId(planDay.id);
    if (existingItems.length > 0) {
      persistedDays.push({
        id: planDay.id,
        dayNumber: planDay.dayNumber,
        itemCount: existingItems.length,
        reused: true,
      });
      continue;
    }

    const notesByPosition = new Map(
      (day.stopNotes ?? []).map((stop) => [stop.position, stop.note]),
    );
    let position = 0;
    let itemCount = 0;

    for (const stop of day.route.stops) {
      const place = canonicalById.get(stop.placeId);
      if (!place) {
        continue;
      }

      await createPlanItem({
        dayId: planDay.id,
        placeId: place.id,
        type: stop.itemType,
        position,
        startTime: timeOfDay(stop.startMinutes),
        durationMinutes: stop.durationMinutes,
        notes: notesByPosition.get(stop.position) ?? stop.note,
        snapshot: placeSnapshot(place),
      });

      position += 1;
      itemCount += 1;
    }

    persistedDays.push({
      id: planDay.id,
      dayNumber: planDay.dayNumber,
      itemCount,
      reused: Boolean(existing),
    });
  }

  return persistedDays;
}
