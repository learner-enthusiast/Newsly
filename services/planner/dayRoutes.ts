import { listIsoDatesInclusive } from "@/services/AIAgents.ts/planner-intake/dates";
import type { PlanningRequest } from "@/services/AIAgents.ts/planner-intake/schema";
import type { CanonicalPlace } from "@/services/planner/canonicalPlace";
import { placeTypeToPlanItemType } from "@/services/planner/canonicalPlace";
import { clusterPlacesByArea } from "@/services/planner/normalize/clusterAreas";

export type RoutePlace = {
  id: string;
  name: string;
  type: CanonicalPlace["type"];
  address: string | null;
  city: string | null;
  area: string | null;
};

export type DayRouteCandidate = {
  dayNumber: number;
  date: string | null;
  places: RoutePlace[];
};

const MAX_ITEMS_PER_DAY = 6;

const VISIT_RANK: Record<string, number> = {
  pandal: 0,
  temple: 0,
  event: 1,
  food: 2,
  restaurant: 2,
  cafe: 2,
  parking: 3,
  restroom: 3,
};

function visitDaySlots(params: {
  request: PlanningRequest;
  festivalStart: string | null;
  festivalEnd: string | null;
}): Array<{ dayNumber: number; date: string | null }> {
  const visitDates = [...(params.request.visitDates ?? [])]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));

  if (visitDates.length > 0) {
    return visitDates.map((date, index) => ({
      dayNumber: index + 1,
      date,
    }));
  }

  const duration = params.request.durationDays ?? 1;

  if (params.festivalStart && params.festivalEnd) {
    const window = listIsoDatesInclusive(
      params.festivalStart,
      params.festivalEnd,
    );
    const dates = window.slice(0, Math.max(duration, 1));

    if (dates.length > 0) {
      return dates.map((date, index) => ({
        dayNumber: index + 1,
        date,
      }));
    }
  }

  return Array.from({ length: Math.max(duration, 1) }, (_, index) => ({
    dayNumber: index + 1,
    date: null,
  }));
}

function rankPlace(place: RoutePlace) {
  return VISIT_RANK[place.type] ?? 4;
}

/**
 * Deterministic area clustering + round-robin assignment onto visit days.
 * Places must already be upserted research places — nothing is invented here.
 */
export function buildDayRouteCandidates(params: {
  request: PlanningRequest;
  festivalStart: string | null;
  festivalEnd: string | null;
  places: CanonicalPlace[];
}): DayRouteCandidate[] {
  const slots = visitDaySlots(params);
  const usable = params.places.filter(
    (place) => placeTypeToPlanItemType(place.type) != null,
  );
  const clusters = clusterPlacesByArea(usable);
  const ordered = (
    clusters.length > 0
      ? clusters.flatMap((cluster) =>
          cluster.placeIndexes
            .map((index) => usable[index])
            .filter((place): place is CanonicalPlace => place != null),
        )
      : usable
  ).filter(
    (place, index, all) => all.findIndex((item) => item.id === place.id) === index,
  );

  const buckets: CanonicalPlace[][] = Array.from(
    { length: slots.length },
    () => [],
  );

  ordered.forEach((place, index) => {
    buckets[index % slots.length].push(place);
  });

  return slots.map((slot, index) => ({
    dayNumber: slot.dayNumber,
    date: slot.date,
    places: [...buckets[index]]
      .sort((left, right) => rankPlace(left) - rankPlace(right))
      .slice(0, MAX_ITEMS_PER_DAY)
      .map((place) => ({
        id: place.id,
        name: place.name,
        type: place.type,
        address: place.address,
        city: place.city,
        area: place.area,
      })),
  }));
}
