import { listIsoDatesInclusive } from "@/services/AIAgents.ts/planner-intake/dates";
import type { PlanningRequest } from "@/services/AIAgents.ts/planner-intake/schema";
import {
  buildPlanningRegions,
  centroidOf,
  splitRegion,
  type PlanningRegion,
  type RegionPlace,
} from "@/services/planner/areas";
import { deriveAreaLabel } from "@/services/planner/normalize/areaLabel";
import { haversineKm } from "@/services/planner/normalize/clusterAreas";
import {
  isFestivalPlaceType,
  isFoodPlaceType,
  placeTypeToPlanItemType,
  type PlaceType,
  type PlanItemType,
} from "@/services/planner/normalize/placeType";
import {
  formatClock,
  foodBudget,
  isCrossAreaMovement,
  isFoodFocusedRequest,
  LOCAL_MOVEMENT_KM,
  mealWindowsWithin,
  PLANNING_RULES,
  resolveDayWindow,
  resolveTransportMode,
  transportProfile,
  travelMinutes,
  VISIT_MINUTES,
  type DayWindow,
  type FestivalTiming,
  type MealWindow,
  type TransportMode,
} from "@/services/planner/planningRules";

/**
 * Festival-first day/route planning.
 *
 * Order of reasoning (never the reverse): festival places → geographic
 * clusters → one coherent cluster per day → a walkable/ordered route inside
 * that cluster → food inserted only where a meal window falls.
 *
 * Everything here is deterministic. Places are researched records; this module
 * only chooses and orders them, and never invents a venue, coordinate or time.
 */
export type RoutablePlace = {
  id: string;
  name: string;
  type: PlaceType;
  address: string | null;
  city: string | null;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  reviewCount: number | null;
};

export type RouteStop = {
  placeId: string;
  name: string;
  placeType: PlaceType;
  itemType: Exclude<PlanItemType, "custom">;
  role: "festival" | "food";
  address: string | null;
  city: string | null;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
  position: number;
  startMinutes: number;
  durationMinutes: number;
  travelKmFromPrevious: number | null;
  travelMinutesFromPrevious: number;
  transportFromPrevious: TransportMode | null;
  mealWindow: MealWindow["id"] | null;
  note: string;
};

export type DayRoute = {
  dayNumber: number;
  date: string | null;
  regionId: string | null;
  areaLabel: string | null;
  transportMode: TransportMode;
  transportExplicit: boolean;
  startMinutes: number;
  endMinutes: number;
  startSuggested: boolean;
  endSuggested: boolean;
  stops: RouteStop[];
  festivalStopCount: number;
  foodStopCount: number;
  travelKm: number;
};

export type BuildDayRoutesParams = {
  request: PlanningRequest;
  festivalStart: string | null;
  festivalEnd: string | null;
  places: RoutablePlace[];
  timings?: FestivalTiming[];
  /** Strict rebuild after a failed validation: festival stops only. */
  foodStopsPerDayOverride?: number;
};

type ScoredPlace = RoutablePlace & { neighbours: number };

function located<T extends { latitude: number | null; longitude: number | null }>(
  place: T,
): place is T & { latitude: number; longitude: number } {
  return place.latitude != null && place.longitude != null;
}

function distanceKm(
  left: RoutablePlace | null,
  right: RoutablePlace,
): number | null {
  if (!left || !located(left) || !located(right)) {
    return null;
  }

  return haversineKm(left, right);
}

/** Visit days come from the intake request, never from an LLM. */
export function visitDaySlots(params: {
  request: PlanningRequest;
  festivalStart: string | null;
  festivalEnd: string | null;
}): Array<{ dayNumber: number; date: string | null }> {
  const visitDates = [...(params.request.visitDates ?? [])]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));

  if (visitDates.length > 0) {
    return visitDates.map((date, index) => ({ dayNumber: index + 1, date }));
  }

  const duration = Math.max(params.request.durationDays ?? 1, 1);

  if (params.festivalStart && params.festivalEnd) {
    const dates = listIsoDatesInclusive(
      params.festivalStart,
      params.festivalEnd,
    ).slice(0, duration);

    if (dates.length > 0) {
      return dates.map((date, index) => ({ dayNumber: index + 1, date }));
    }
  }

  return Array.from({ length: duration }, (_, index) => ({
    dayNumber: index + 1,
    date: null,
  }));
}

/** The dates a plan actually covers — the contract weather and days must match. */
export function effectiveVisitDates(params: {
  request: PlanningRequest;
  festivalStart: string | null;
  festivalEnd: string | null;
}) {
  return visitDaySlots(params)
    .map((slot) => slot.date)
    .filter((date): date is string => date != null);
}

function toRegionPlace(place: RoutablePlace): RegionPlace {
  return {
    id: place.id,
    name: place.name,
    area: place.area,
    address: place.address,
    city: place.city,
    latitude: place.latitude,
    longitude: place.longitude,
    rating: place.rating,
    reviewCount: place.reviewCount,
  };
}

/** Neighbour count = how many other stops sit within easy walking distance. */
function scorePlaces(places: RoutablePlace[]): ScoredPlace[] {
  return places.map((place) => ({
    ...place,
    neighbours: places.filter((other) => {
      if (other.id === place.id) {
        return false;
      }

      const distance = distanceKm(place, other);
      return distance != null && distance <= LOCAL_MOVEMENT_KM;
    }).length,
  }));
}

/**
 * Quality signal for picking a starting stop. Ratings and review counts are
 * supporting evidence only — cluster density matters more, because a dense
 * anchor keeps the rest of the day walkable.
 */
function anchorScore(place: ScoredPlace) {
  const rating = place.rating ?? 0;
  const reviews = place.reviewCount ?? 0;
  const popularity = reviews > 0 ? Math.log10(reviews + 1) : 0;

  return place.neighbours * 2 + rating * 0.6 + popularity * 0.4;
}

/**
 * Splits or reuses regions so every day gets a coherent area. A destination
 * with fewer clusters than days keeps a single region and simply hands each
 * day a different slice of it.
 */
function regionsForDays(
  regions: PlanningRegion[],
  dayCount: number,
  city?: string | null,
): PlanningRegion[] {
  if (regions.length === 0) {
    return [];
  }

  const pool = [...regions];

  while (pool.length < dayCount) {
    const index = pool.reduce(
      (best, region, current) =>
        region.places.length > pool[best].places.length ? current : best,
      0,
    );

    const parts = splitRegion(pool[index], 2, city);
    if (parts.length < 2) {
      break;
    }

    pool.splice(index, 1, ...parts);
  }

  const ordered = [...pool].sort((left, right) => right.score - left.score);

  return Array.from({ length: dayCount }, (_, index) =>
    ordered.length > 0 ? ordered[index % ordered.length] : regions[0],
  );
}

function stopNote(params: {
  role: "festival" | "food";
  mealWindow: MealWindow | null;
  travelKm: number | null;
  mode: TransportMode | null;
  first: boolean;
  areaLabel: string | null;
}) {
  if (params.first) {
    return params.areaLabel
      ? `Start here in ${params.areaLabel}.`
      : "Start here.";
  }

  const movement =
    params.travelKm == null
      ? "Continue to the next stop"
      : params.travelKm <= LOCAL_MOVEMENT_KM
        ? `Walk about ${params.travelKm.toFixed(1)} km from the previous stop`
        : `Travel about ${params.travelKm.toFixed(1)} km by ${params.mode ?? "local transport"}`;

  if (params.role === "food" && params.mealWindow) {
    return `${movement} for ${params.mealWindow.label}.`;
  }

  return `${movement}.`;
}

function buildStop(params: {
  place: RoutablePlace;
  previous: RoutablePlace | null;
  role: "festival" | "food";
  mode: TransportMode;
  mealWindow: MealWindow | null;
  areaLabel: string | null;
  position: number;
  startMinutes: number;
}): RouteStop | null {
  const itemType = placeTypeToPlanItemType(params.place.type);
  if (!itemType) {
    return null;
  }

  const travelKm = distanceKm(params.previous, params.place);
  const first = params.previous == null;
  const minutes = first
    ? 0
    : travelKm == null
      ? transportProfile(params.mode).overheadMinutes + 15
      : travelMinutes(travelKm, params.mode);

  return {
    placeId: params.place.id,
    name: params.place.name,
    placeType: params.place.type,
    itemType,
    role: params.role,
    address: params.place.address,
    city: params.place.city,
    area:
      params.place.area ??
      deriveAreaLabel(params.place.address, params.place.city) ??
      params.areaLabel,
    latitude: params.place.latitude,
    longitude: params.place.longitude,
    position: params.position,
    startMinutes: params.startMinutes,
    durationMinutes: VISIT_MINUTES[params.place.type] ?? 30,
    travelKmFromPrevious: travelKm,
    travelMinutesFromPrevious: minutes,
    transportFromPrevious: first
      ? null
      : travelKm != null && !isCrossAreaMovement(travelKm)
        ? "walking"
        : params.mode,
    mealWindow: params.mealWindow?.id ?? null,
    note: stopNote({
      role: params.role,
      mealWindow: params.mealWindow,
      travelKm,
      mode:
        travelKm != null && !isCrossAreaMovement(travelKm)
          ? "walking"
          : params.mode,
      first,
      areaLabel: params.areaLabel,
    }),
  };
}

/** Re-times a route in place after an insertion, keeping stops sequential. */
function schedule(
  entries: Array<{ place: RoutablePlace; role: "festival" | "food"; meal: MealWindow | null }>,
  params: { mode: TransportMode; startMinutes: number; areaLabel: string | null },
) {
  const stops: RouteStop[] = [];
  let clock = params.startMinutes;
  let previous: RoutablePlace | null = null;

  entries.forEach((entry, index) => {
    const stop = buildStop({
      place: entry.place,
      previous,
      role: entry.role,
      mode: params.mode,
      mealWindow: entry.meal,
      areaLabel: params.areaLabel,
      position: index,
      startMinutes: clock,
    });

    if (!stop) {
      return;
    }

    clock += stop.travelMinutesFromPrevious;
    stop.startMinutes = clock;
    clock += stop.durationMinutes;
    previous = entry.place;
    stops.push(stop);
  });

  return { stops, endMinutes: clock };
}

/** Greedy nearest-neighbour walk through a cluster: no backtracking by design. */
function selectFestivalRoute(params: {
  candidates: ScoredPlace[];
  window: DayWindow;
  mode: TransportMode;
  used: Set<string>;
}) {
  const profile = transportProfile(params.mode);
  const budget =
    (params.window.endMinutes - params.window.startMinutes) *
    PLANNING_RULES.dayTimeUtilisation;

  const available = params.candidates.filter((place) => !params.used.has(place.id));
  if (available.length === 0) {
    return [] as RoutablePlace[];
  }

  const anchor = [...available].sort(
    (left, right) => anchorScore(right) - anchorScore(left),
  )[0];

  const route: RoutablePlace[] = [anchor];
  let spent = VISIT_MINUTES[anchor.type] ?? 30;
  const picked = new Set<string>([anchor.id]);

  while (route.length < PLANNING_RULES.maxFestivalStopsPerDay) {
    const last = route[route.length - 1];
    let best: { place: ScoredPlace; distance: number } | null = null;

    for (const candidate of available) {
      if (picked.has(candidate.id)) {
        continue;
      }

      const distance = distanceKm(last, candidate);
      const effective = distance ?? profile.maxLegKm;

      if (effective > profile.maxLegKm) {
        continue;
      }

      if (!best || effective < best.distance) {
        best = { place: candidate, distance: effective };
      }
    }

    if (!best) {
      break;
    }

    const cost =
      travelMinutes(best.distance, params.mode) +
      (VISIT_MINUTES[best.place.type] ?? 30);

    if (spent + cost > budget) {
      break;
    }

    route.push(best.place);
    picked.add(best.place.id);
    spent += cost;
  }

  return route;
}

/** Food follows the clock and the route — never the other way around. */
function insertFoodStops(params: {
  entries: Array<{ place: RoutablePlace; role: "festival" | "food"; meal: MealWindow | null }>;
  foodPlaces: RoutablePlace[];
  window: DayWindow;
  mode: TransportMode;
  used: Set<string>;
  maxStops: number;
  maxShare: number;
  stopsPerMealWindow: number;
  arrivalTolerance: number;
  areaLabel: string | null;
}) {
  const profile = transportProfile(params.mode);
  let entries = [...params.entries];
  let inserted = 0;

  // One pass per meal window normally; a food-led request gets a second pass,
  // which is what turns dinner into a crawl without touching festival stops.
  const slots = Array.from({ length: params.stopsPerMealWindow }).flatMap(() =>
    mealWindowsWithin(params.window),
  );

  for (const meal of slots) {
    if (inserted >= params.maxStops) {
      break;
    }

    const projected = entries.length + 1;
    const foodCount = entries.filter((entry) => entry.role === "food").length + 1;
    if (foodCount / projected > params.maxShare) {
      break;
    }

    const timed = schedule(entries, {
      mode: params.mode,
      startMinutes: params.window.startMinutes,
      areaLabel: params.areaLabel,
    });

    // Slot the meal after the last stop that finishes before the window closes.
    let index = timed.stops.findIndex(
      (stop) => stop.startMinutes + stop.durationMinutes > meal.endMinutes,
    );
    index = index === -1 ? timed.stops.length : index;

    if (index === 0) {
      continue;
    }

    const anchor = entries[index - 1]?.place ?? null;
    const arrival = timed.stops[index - 1]
      ? timed.stops[index - 1].startMinutes + timed.stops[index - 1].durationMinutes
      : params.window.startMinutes;

    if (
      arrival < meal.startMinutes - params.arrivalTolerance ||
      arrival > meal.endMinutes + params.arrivalTolerance
    ) {
      continue;
    }

    const preferred: PlaceType[] = meal.substantial
      ? ["restaurant", "cafe", "food"]
      : ["food", "cafe", "restaurant"];

    const candidate = params.foodPlaces
      .filter((place) => !params.used.has(place.id))
      .map((place) => ({
        place,
        distance: distanceKm(anchor, place) ?? profile.maxFoodDetourKm + 1,
        rank: preferred.indexOf(place.type),
      }))
      .filter((entry) => entry.distance <= profile.maxFoodDetourKm && entry.rank >= 0)
      .sort(
        (left, right) =>
          left.rank - right.rank || left.distance - right.distance,
      )[0];

    if (!candidate) {
      continue;
    }

    entries = [
      ...entries.slice(0, index),
      { place: candidate.place, role: "food" as const, meal },
      ...entries.slice(index),
    ];
    params.used.add(candidate.place.id);
    inserted += 1;
  }

  return entries;
}

/**
 * Builds one coherent day per visit date: a cluster, a festival route through
 * it, and food only at meal times.
 */
export function buildDayRoutes(params: BuildDayRoutesParams): DayRoute[] {
  const slots = visitDaySlots(params);
  const city = params.request.city;
  const festivalPlaces = params.places.filter((place) =>
    isFestivalPlaceType(place.type),
  );
  const foodPlaces = params.places.filter((place) => isFoodPlaceType(place.type));

  const transport = resolveTransportMode(params.request.transport);
  const window = resolveDayWindow({
    startTime: params.request.startTime,
    endTime: params.request.endTime,
    durationHours: params.request.durationHours,
    timings: params.timings,
  });

  const budget = foodBudget(isFoodFocusedRequest(params.request));
  const maxFoodStops =
    params.foodStopsPerDayOverride ?? budget.maxStopsPerDay;

  const regions = buildPlanningRegions(
    festivalPlaces.map(toRegionPlace),
    { city },
  );
  const dayRegions = regionsForDays(regions, slots.length, city);
  const used = new Set<string>();
  const placeById = new Map(params.places.map((place) => [place.id, place]));

  return slots.map((slot, index) => {
    const region = dayRegions[index] ?? null;
    const regionPlaces = (region?.places ?? [])
      .map((place) => placeById.get(place.id))
      .filter((place): place is RoutablePlace => place != null);

    // Fall back to the wider festival pool when a cluster runs out of
    // unvisited stops, so a day is never left empty.
    const pool = regionPlaces.some((place) => !used.has(place.id))
      ? regionPlaces
      : festivalPlaces;

    const route = selectFestivalRoute({
      candidates: scorePlaces(pool),
      window,
      mode: transport.mode,
      used,
    });

    for (const place of route) {
      used.add(place.id);
    }

    const areaLabel =
      region?.label ??
      deriveAreaLabel(route[0]?.address ?? null, city) ??
      route[0]?.area ??
      null;

    const withFood =
      maxFoodStops > 0 && route.length > 0
        ? insertFoodStops({
            entries: route.map((place) => ({
              place,
              role: "festival" as const,
              meal: null,
            })),
            foodPlaces,
            window,
            mode: transport.mode,
            used,
            maxStops: maxFoodStops,
            maxShare: budget.maxShareOfDay,
            stopsPerMealWindow: budget.stopsPerMealWindow,
            arrivalTolerance: budget.arrivalToleranceMinutes,
            areaLabel,
          })
        : route.map((place) => ({
            place,
            role: "festival" as const,
            meal: null,
          }));

    const timed = schedule(withFood, {
      mode: transport.mode,
      startMinutes: window.startMinutes,
      areaLabel,
    });

    return {
      dayNumber: slot.dayNumber,
      date: slot.date,
      regionId: region?.id ?? null,
      areaLabel,
      transportMode: transport.mode,
      transportExplicit: transport.explicit,
      startMinutes: window.startMinutes,
      endMinutes: Math.max(timed.endMinutes, window.endMinutes),
      startSuggested: window.startSuggested,
      endSuggested: window.endSuggested,
      stops: timed.stops,
      festivalStopCount: timed.stops.filter((stop) => stop.role === "festival")
        .length,
      foodStopCount: timed.stops.filter((stop) => stop.role === "food").length,
      travelKm: timed.stops.reduce(
        (sum, stop) => sum + (stop.travelKmFromPrevious ?? 0),
        0,
      ),
    };
  });
}

/** Compact, human-readable day summary used in agent prompts and logs. */
export function describeDayRoute(day: DayRoute) {
  return {
    dayNumber: day.dayNumber,
    date: day.date,
    area: day.areaLabel,
    window: `${formatClock(day.startMinutes)}–${formatClock(day.endMinutes)}`,
    transport: day.transportMode,
    stops: day.stops.map((stop) => ({
      position: stop.position,
      name: stop.name,
      type: stop.placeType,
      role: stop.role,
      area: stop.area,
      arrives: formatClock(stop.startMinutes),
      stayMinutes: stop.durationMinutes,
      travelKmFromPrevious: stop.travelKmFromPrevious,
      mealWindow: stop.mealWindow,
    })),
  };
}

export function centroidOfRoute(day: DayRoute) {
  return centroidOf(
    day.stops.map((stop) => ({
      id: stop.placeId,
      name: stop.name,
      area: stop.area,
      address: stop.address,
      city: stop.city,
      latitude: stop.latitude,
      longitude: stop.longitude,
      rating: null,
      reviewCount: null,
    })),
  );
}
