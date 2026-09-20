import type { DayRoute } from "@/services/planner/dayRoutes";
import { haversineKm } from "@/services/planner/normalize/clusterAreas";
import {
  foodBudget,
  PLANNING_RULES,
  transportProfile,
} from "@/services/planner/planningRules";

/**
 * Deterministic gate between "generated" and "ready".
 *
 * Everything checked here is a rule the planner is supposed to satisfy by
 * construction; the validator exists so a bad generation fails loudly instead
 * of being silently persisted and patched afterwards.
 */
export type PlanValidationIssue = {
  code: string;
  message: string;
  dayNumber?: number;
};

export type PlanValidationResult = {
  ok: boolean;
  issues: PlanValidationIssue[];
};

export type PlanValidationInput = {
  description: string | null;
  title?: string | null;
  visitDates: string[];
  expectedDayCount: number;
  weatherDays: Array<{ date: string | null }>;
  days: DayRoute[];
  knownPlaceIds: Iterable<string>;
  foodFocused: boolean;
};

export function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function located<T extends { latitude: number | null; longitude: number | null }>(
  stop: T,
): stop is T & { latitude: number; longitude: number } {
  return stop.latitude != null && stop.longitude != null;
}

/**
 * Flags a route that leaves an area and comes back to it (the "South → North
 * → back to South" shape) by labelling stops with coarse geographic buckets
 * and looking for a repeated bucket after an intervening one.
 */
export function hasBacktracking(
  stops: Array<{ latitude: number | null; longitude: number | null }>,
  bucketRadiusKm = 2.5,
) {
  const buckets: Array<{ latitude: number; longitude: number }> = [];
  const sequence: number[] = [];

  for (const stop of stops) {
    if (!located(stop)) {
      continue;
    }

    const index = buckets.findIndex(
      (bucket) => haversineKm(bucket, stop) <= bucketRadiusKm,
    );

    if (index === -1) {
      buckets.push({ latitude: stop.latitude, longitude: stop.longitude });
      sequence.push(buckets.length - 1);
      continue;
    }

    sequence.push(index);
  }

  for (let index = 2; index < sequence.length; index += 1) {
    const earlier = sequence.slice(0, index - 1);
    if (
      sequence[index] !== sequence[index - 1] &&
      earlier.includes(sequence[index])
    ) {
      return true;
    }
  }

  return false;
}

export function validatePlanDraft(
  input: PlanValidationInput,
): PlanValidationResult {
  const issues: PlanValidationIssue[] = [];
  const known = new Set(input.knownPlaceIds);
  const budget = foodBudget(input.foodFocused);
  const seenAcrossPlan = new Set<string>();

  // --- Plan description is required and must be substantial ---
  const description = input.description?.trim() ?? "";
  if (!description) {
    issues.push({
      code: "description_missing",
      message: "Plan description is required before a plan can be marked ready.",
    });
  } else if (countWords(description) < PLANNING_RULES.description.minWords) {
    issues.push({
      code: "description_too_short",
      message: `Plan description has ${countWords(description)} words; at least ${PLANNING_RULES.description.minWords} are required.`,
    });
  }

  // --- Weather must cover every visit date, in order ---
  const weatherDates = input.weatherDays.map((day) => day.date);
  if (weatherDates.length !== input.visitDates.length) {
    issues.push({
      code: "weather_day_count_mismatch",
      message: `Weather has ${weatherDates.length} days for ${input.visitDates.length} visit dates.`,
    });
  }

  for (const [index, date] of input.visitDates.entries()) {
    if (!weatherDates.includes(date)) {
      issues.push({
        code: "weather_missing_date",
        message: `No weather entry for visit date ${date}.`,
      });
      continue;
    }

    if (weatherDates[index] !== date) {
      issues.push({
        code: "weather_date_order",
        message: `Weather day ${index + 1} is ${weatherDates[index]}, expected ${date}.`,
      });
    }
  }

  // --- Day count and dates must match the request ---
  if (input.days.length !== input.expectedDayCount) {
    issues.push({
      code: "day_count_mismatch",
      message: `Plan has ${input.days.length} days, expected ${input.expectedDayCount}.`,
    });
  }

  input.days.forEach((day, index) => {
    if (day.dayNumber !== index + 1) {
      issues.push({
        code: "day_number_sequence",
        message: `Day at position ${index + 1} is numbered ${day.dayNumber}.`,
        dayNumber: day.dayNumber,
      });
    }

    const expectedDate = input.visitDates[index];
    if (expectedDate && day.date !== expectedDate) {
      issues.push({
        code: "day_date_mismatch",
        message: `Day ${day.dayNumber} is dated ${day.date ?? "null"}, expected ${expectedDate}.`,
        dayNumber: day.dayNumber,
      });
    }

    const profile = transportProfile(day.transportMode);
    const festivalStops = day.stops.filter((stop) => stop.role === "festival");
    const foodStops = day.stops.filter((stop) => stop.role === "food");

    if (day.stops.length === 0) {
      issues.push({
        code: "day_empty",
        message: `Day ${day.dayNumber} has no stops.`,
        dayNumber: day.dayNumber,
      });
      return;
    }

    if (festivalStops.length === 0) {
      issues.push({
        code: "day_without_festival_stop",
        message: `Day ${day.dayNumber} has no festival stop.`,
        dayNumber: day.dayNumber,
      });
    } else if (
      festivalStops.length < PLANNING_RULES.minFestivalStopsPerDay &&
      day.stops.length > festivalStops.length
    ) {
      issues.push({
        code: "day_below_min_festival_stops",
        message: `Day ${day.dayNumber} has ${festivalStops.length} festival stop(s) but adds food stops.`,
        dayNumber: day.dayNumber,
      });
    }

    // --- Food must stay secondary unless the user asked otherwise ---
    if (foodStops.length > budget.maxStopsPerDay) {
      issues.push({
        code: "food_stop_limit",
        message: `Day ${day.dayNumber} has ${foodStops.length} food stops, limit is ${budget.maxStopsPerDay}.`,
        dayNumber: day.dayNumber,
      });
    }

    if (foodStops.length / day.stops.length > budget.maxShareOfDay) {
      issues.push({
        code: "food_dominant_day",
        message: `Day ${day.dayNumber} is ${Math.round((foodStops.length / day.stops.length) * 100)}% food stops; festival stops must dominate.`,
        dayNumber: day.dayNumber,
      });
    }

    // --- Every item must point at a researched place, used once ---
    const seenInDay = new Set<string>();

    for (const stop of day.stops) {
      if (!known.has(stop.placeId)) {
        issues.push({
          code: "unknown_place",
          message: `Day ${day.dayNumber} references place ${stop.placeId} ("${stop.name}") that is not a researched place.`,
          dayNumber: day.dayNumber,
        });
      }

      if (seenInDay.has(stop.placeId)) {
        issues.push({
          code: "duplicate_place_in_day",
          message: `Day ${day.dayNumber} visits "${stop.name}" more than once.`,
          dayNumber: day.dayNumber,
        });
      }
      seenInDay.add(stop.placeId);

      if (seenAcrossPlan.has(stop.placeId)) {
        issues.push({
          code: "duplicate_place_in_plan",
          message: `"${stop.name}" appears on more than one day.`,
          dayNumber: day.dayNumber,
        });
      }
      seenAcrossPlan.add(stop.placeId);

      if (
        stop.travelKmFromPrevious != null &&
        stop.travelKmFromPrevious > profile.maxLegKm
      ) {
        issues.push({
          code: "unrealistic_travel_leg",
          message: `Day ${day.dayNumber}: ${stop.travelKmFromPrevious.toFixed(1)} km hop to "${stop.name}" exceeds the ${profile.maxLegKm} km limit for ${day.transportMode}.`,
          dayNumber: day.dayNumber,
        });
      }
    }

    // --- The day must read as one geographic area ---
    const points = day.stops.filter(located);
    if (points.length >= 2) {
      const spread = points.reduce(
        (max, left) =>
          Math.max(
            max,
            ...points.map((right) => haversineKm(left, right)),
          ),
        0,
      );

      if (spread > profile.maxDaySpreadKm) {
        issues.push({
          code: "day_area_incoherent",
          message: `Day ${day.dayNumber} spans ${spread.toFixed(1)} km, beyond the ${profile.maxDaySpreadKm} km limit for ${day.transportMode}.`,
          dayNumber: day.dayNumber,
        });
      }
    }

    if (hasBacktracking(day.stops)) {
      issues.push({
        code: "route_backtracking",
        message: `Day ${day.dayNumber} leaves an area and returns to it.`,
        dayNumber: day.dayNumber,
      });
    }
  });

  return { ok: issues.length === 0, issues };
}
