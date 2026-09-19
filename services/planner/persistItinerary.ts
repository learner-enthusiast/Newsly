import { createPlanDay, getPlanDaysByPlanId } from "@/repositories/planDay";
import { createPlanItem, getPlanItemsByDayId } from "@/repositories/planItem";
import {
  placeSnapshot,
  placeTypeToPlanItemType,
  type CanonicalPlace,
} from "@/services/planner/canonicalPlace";
import type { DayRouteCandidate } from "@/services/planner/dayRoutes";

function placeById(places: CanonicalPlace[]) {
  return new Map(places.map((place) => [place.id, place]));
}

export async function persistPlanDaysAndItems(params: {
  planId: string;
  days: Array<DayRouteCandidate & { title: string; description: string }>;
  places: CanonicalPlace[];
}) {
  const existingDays = await getPlanDaysByPlanId(params.planId);
  const canonicalById = placeById(params.places);
  const existingByNumber = new Map(
    existingDays.map((day) => [day.dayNumber, day]),
  );

  const persistedDays = [];

  for (const day of params.days) {
    const existing = existingByNumber.get(day.dayNumber);
    const planDay =
      existing ??
      (await createPlanDay({
        planId: params.planId,
        dayNumber: day.dayNumber,
        date: day.date ? new Date(`${day.date}T00:00:00.000Z`) : null,
        title: day.title,
        description: day.description,
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

    const items = [];
    let position = 0;

    for (const routePlace of day.places) {
      const place = canonicalById.get(routePlace.id);
      if (!place) {
        continue;
      }

      const itemType = placeTypeToPlanItemType(place.type);
      if (!itemType) {
        continue;
      }

      items.push(
        await createPlanItem({
          dayId: planDay.id,
          placeId: place.id,
          type: itemType,
          position,
          snapshot: placeSnapshot(place),
        }),
      );
      position += 1;
    }

    persistedDays.push({
      id: planDay.id,
      dayNumber: planDay.dayNumber,
      itemCount: items.length,
      reused: Boolean(existing),
    });
  }

  return persistedDays;
}
