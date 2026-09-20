import type { PlaceType } from "@/services/planner/normalize/placeType";

/**
 * Configurable planning heuristics shared by the route builder and the
 * validator, so "what we build" and "what we accept" can never drift apart.
 *
 * Nothing here encodes a specific city, locality or fixed stop count: the
 * numbers describe human travel/visit behaviour and get combined with the
 * researched place data at runtime.
 */
export type TransportMode =
  | "walking"
  | "metro"
  | "bus"
  | "auto"
  | "cab"
  | "car"
  | "mixed";

export type TransportProfile = {
  /** Effective door-to-door speed including festival-time congestion. */
  speedKmh: number;
  /** Per-leg fixed cost: waiting, hailing, walking to/from a station. */
  overheadMinutes: number;
  /** Longest single hop that stays realistic for this mode. */
  maxLegKm: number;
  /** How far off-route a food stop may sit. */
  maxFoodDetourKm: number;
  /** How far apart a single day's stops may spread before it stops being one area. */
  maxDaySpreadKm: number;
};

export const TRANSPORT_PROFILES: Record<TransportMode, TransportProfile> = {
  walking: { speedKmh: 4, overheadMinutes: 0, maxLegKm: 2.5, maxFoodDetourKm: 1.2, maxDaySpreadKm: 3.5 },
  metro: { speedKmh: 18, overheadMinutes: 14, maxLegKm: 25, maxFoodDetourKm: 2, maxDaySpreadKm: 15 },
  bus: { speedKmh: 12, overheadMinutes: 10, maxLegKm: 18, maxFoodDetourKm: 2, maxDaySpreadKm: 12 },
  auto: { speedKmh: 14, overheadMinutes: 6, maxLegKm: 14, maxFoodDetourKm: 2.5, maxDaySpreadKm: 12 },
  cab: { speedKmh: 16, overheadMinutes: 7, maxLegKm: 30, maxFoodDetourKm: 3, maxDaySpreadKm: 18 },
  car: { speedKmh: 16, overheadMinutes: 8, maxLegKm: 30, maxFoodDetourKm: 3, maxDaySpreadKm: 18 },
  mixed: { speedKmh: 13, overheadMinutes: 8, maxLegKm: 20, maxFoodDetourKm: 2.5, maxDaySpreadKm: 14 },
};

/** Legs shorter than this are walked regardless of the declared mode. */
export const LOCAL_MOVEMENT_KM = 1.2;

export const VISIT_MINUTES: Record<PlaceType, number> = {
  pandal: 40,
  temple: 30,
  event: 45,
  food: 25,
  restaurant: 55,
  cafe: 30,
  parking: 10,
  restroom: 10,
  atm: 10,
  pharmacy: 10,
  other: 25,
};

export type MealWindow = {
  id: "breakfast" | "lunch" | "snack" | "dinner";
  label: string;
  startMinutes: number;
  endMinutes: number;
  /** A sit-down meal, as opposed to a quick street-food stop. */
  substantial: boolean;
};

export const MEAL_WINDOWS: MealWindow[] = [
  { id: "breakfast", label: "breakfast", startMinutes: 7 * 60 + 30, endMinutes: 10 * 60, substantial: true },
  { id: "lunch", label: "lunch", startMinutes: 12 * 60, endMinutes: 15 * 60, substantial: true },
  { id: "snack", label: "evening snack", startMinutes: 16 * 60, endMinutes: 18 * 60 + 30, substantial: false },
  { id: "dinner", label: "dinner", startMinutes: 19 * 60 + 30, endMinutes: 22 * 60 + 30, substantial: true },
];

export const PLANNING_RULES = {
  /** Fallback window when neither the user nor research gives times. */
  defaultStartMinutes: 16 * 60,
  defaultEndMinutes: 22 * 60,
  /** Bounds for a start time derived from researched festival timings. */
  earliestDerivedStartMinutes: 9 * 60,
  latestDerivedStartMinutes: 18 * 60,
  minDayMinutes: 150,
  maxDayMinutes: 12 * 60,

  /** Area/cluster discovery. */
  clusterRadiusKm: 2,
  maxClusterRadiusKm: 5,
  minFestivalPlacesForMultipleRegions: 6,
  minPlacesPerRegion: 2,
  /** Below this spread the destination is planned as one region (small town). */
  singleRegionMaxSpreadKm: 5,

  /** Festival stops. */
  minFestivalStopsPerDay: 2,
  maxFestivalStopsPerDay: 7,
  /** Reserve for food/transfers so a day is never packed wall-to-wall. */
  dayTimeUtilisation: 0.92,

  /**
   * Food is supporting content unless the user asked for a food-led trip.
   * `stopsPerMealWindow` is what turns a normal plan's one-meal-per-window
   * rhythm into a crawl when the user explicitly wants one.
   */
  food: {
    normal: { maxStopsPerDay: 2, maxShareOfDay: 0.34, stopsPerMealWindow: 1, arrivalToleranceMinutes: 45 },
    foodFocused: { maxStopsPerDay: 4, maxShareOfDay: 0.6, stopsPerMealWindow: 2, arrivalToleranceMinutes: 90 },
  },

  /** Plan description quality floor (see validatePlan). */
  description: { minWords: 110, maxWords: 400 },
} as const;

const TRANSPORT_ALIASES: Array<{ match: RegExp; mode: TransportMode }> = [
  { match: /walk|foot|padyatra/i, mode: "walking" },
  { match: /metro|subway|underground|local train|train/i, mode: "metro" },
  { match: /bus/i, mode: "bus" },
  { match: /auto|rickshaw|toto|tuk/i, mode: "auto" },
  { match: /cab|taxi|uber|ola/i, mode: "cab" },
  { match: /car|drive|driving|self.?drive/i, mode: "car" },
  { match: /mix|combination|public transport|any/i, mode: "mixed" },
];

export function resolveTransportMode(
  transport: string | null | undefined,
): { mode: TransportMode; explicit: boolean } {
  const raw = transport?.trim();
  if (!raw) {
    return { mode: "mixed", explicit: false };
  }

  const match = TRANSPORT_ALIASES.find(({ match: pattern }) => pattern.test(raw));
  return { mode: match?.mode ?? "mixed", explicit: Boolean(match) };
}

export function transportProfile(mode: TransportMode) {
  return TRANSPORT_PROFILES[mode];
}

/**
 * Travel time for one leg. Short hops fall back to walking even when the user
 * picked a vehicle, which is what people actually do between nearby pandals.
 */
export function travelMinutes(distanceKm: number, mode: TransportMode) {
  const profile =
    distanceKm <= LOCAL_MOVEMENT_KM
      ? TRANSPORT_PROFILES.walking
      : TRANSPORT_PROFILES[mode];

  return Math.round((distanceKm / profile.speedKmh) * 60 + profile.overheadMinutes);
}

export function isCrossAreaMovement(distanceKm: number) {
  return distanceKm > LOCAL_MOVEMENT_KM;
}

const FOOD_FOCUS_PATTERNS =
  /food.?(heavy|crawl|tour|trail|focus)|street.?food.?(crawl|tour|trail)|eat(ing)?.?(tour|crawl|spree)|famous.?(food|eat)|foodie/i;

/** True when the user explicitly asked for a food-led trip. */
export function isFoodFocusedRequest(request: {
  foodPreferences?: string[] | null;
  otherPreferences?: Record<string, unknown> | null;
}) {
  const values = [
    ...(request.foodPreferences ?? []),
    ...Object.values(request.otherPreferences ?? {}).map((value) =>
      typeof value === "string" ? value : "",
    ),
  ];

  return values.some((value) => FOOD_FOCUS_PATTERNS.test(value));
}

export function foodBudget(foodFocused: boolean) {
  return foodFocused ? PLANNING_RULES.food.foodFocused : PLANNING_RULES.food.normal;
}

/** "17:30", "5:30 pm", "5 PM" → minutes past midnight. */
export function parseClockMinutes(value: string | null | undefined): number | null {
  const raw = value?.trim().toLowerCase();
  if (!raw) {
    return null;
  }

  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) {
    return null;
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  const meridiem = match[3];

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes > 59) {
    return null;
  }

  if (meridiem === "pm" && hours < 12) {
    hours += 12;
  }

  if (meridiem === "am" && hours === 12) {
    hours = 0;
  }

  if (hours > 23) {
    return null;
  }

  return hours * 60 + minutes;
}

export function formatClock(minutes: number) {
  const clamped = Math.max(0, Math.min(minutes, 24 * 60 - 1));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;

  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export type FestivalTiming = {
  label: string;
  startTime: string | null;
  endTime: string | null;
};

export type DayWindow = {
  startMinutes: number;
  endMinutes: number;
  /** True when the window came from research/defaults instead of the user. */
  startSuggested: boolean;
  endSuggested: boolean;
};

/**
 * Resolves the day's planning window: explicit user times win, then researched
 * festival timings, then the configured default evening window. A derived
 * window is flagged as a suggestion — it is never presented as a fact.
 */
export function resolveDayWindow(params: {
  startTime?: string | null;
  endTime?: string | null;
  durationHours?: number | null;
  timings?: FestivalTiming[];
}): DayWindow {
  const userStart = parseClockMinutes(params.startTime);
  const userEnd = parseClockMinutes(params.endTime);

  const researchedStarts = (params.timings ?? [])
    .map((timing) => parseClockMinutes(timing.startTime))
    .filter((value): value is number => value != null);
  const researchedEnds = (params.timings ?? [])
    .map((timing) => parseClockMinutes(timing.endTime))
    .filter((value): value is number => value != null);

  // A derived start is the latest researched opening time, clamped to a
  // plannable part of the day so an odd "open until 2 AM" line can't push the
  // whole itinerary into the night.
  const derivedStart =
    researchedStarts.length > 0
      ? Math.min(
          Math.max(...researchedStarts, PLANNING_RULES.earliestDerivedStartMinutes),
          PLANNING_RULES.latestDerivedStartMinutes,
        )
      : PLANNING_RULES.defaultStartMinutes;

  const startMinutes = userStart ?? derivedStart;

  const durationMinutes = params.durationHours ? params.durationHours * 60 : null;
  const researchedEnd =
    researchedEnds.length > 0 ? Math.max(...researchedEnds) : null;

  const endCandidate =
    userEnd ??
    (durationMinutes != null
      ? startMinutes + durationMinutes
      : (researchedEnd ?? PLANNING_RULES.defaultEndMinutes));

  // An explicit end time is honoured as given; only derived windows get the
  // minimum-length floor, so "5 PM to 8 PM" never silently becomes a longer day.
  const endMinutes =
    userEnd != null
      ? Math.max(userEnd, startMinutes + 30)
      : Math.min(
          Math.max(endCandidate, startMinutes + PLANNING_RULES.minDayMinutes),
          startMinutes + PLANNING_RULES.maxDayMinutes,
        );

  return {
    startMinutes,
    endMinutes,
    startSuggested: userStart == null,
    endSuggested: userEnd == null,
  };
}

export function mealWindowsWithin(window: DayWindow) {
  return MEAL_WINDOWS.filter(
    (meal) =>
      meal.endMinutes > window.startMinutes && meal.startMinutes < window.endMinutes,
  );
}
