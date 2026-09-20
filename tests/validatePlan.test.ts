import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDayRoutes, type DayRoute } from "@/services/planner/dayRoutes";
import { validatePlanDraft } from "@/services/planner/validatePlan";
import { planningRequest, twoClusterCity } from "./fixtures";

const VISIT_DATES = ["2026-10-16", "2026-10-17"];
const DESCRIPTION = Array.from(
  { length: 160 },
  (_, index) => `word${index}`,
).join(" ");

const places = twoClusterCity();
const days = buildDayRoutes({
  request: planningRequest(),
  festivalStart: "2026-10-16",
  festivalEnd: "2026-10-21",
  places,
});

function validate(overrides: Partial<Parameters<typeof validatePlanDraft>[0]> = {}) {
  return validatePlanDraft({
    description: DESCRIPTION,
    visitDates: VISIT_DATES,
    expectedDayCount: 2,
    weatherDays: VISIT_DATES.map((date) => ({ date })),
    days,
    knownPlaceIds: places.map((place) => place.id),
    foodFocused: false,
    ...overrides,
  });
}

function codes(result: ReturnType<typeof validatePlanDraft>) {
  return result.issues.map((issue) => issue.code);
}

test("a well-formed plan passes validation", () => {
  const result = validate();

  assert.ok(result.ok, codes(result).join(", "));
});

test("a missing plan description fails validation", () => {
  assert.ok(codes(validate({ description: null })).includes("description_missing"));
  assert.ok(codes(validate({ description: "   " })).includes("description_missing"));
});

test("a one-line plan description fails validation", () => {
  const result = validate({
    description: "Durga Puja is a festival in Kolkata. Enjoy the pandals.",
  });

  assert.ok(codes(result).includes("description_too_short"));
});

test("weather with fewer days than visit dates fails validation", () => {
  const result = validate({ weatherDays: [{ date: "2026-10-16" }] });

  assert.ok(codes(result).includes("weather_day_count_mismatch"));
  assert.ok(codes(result).includes("weather_missing_date"));
});

test("fewer plan days than requested fails validation", () => {
  const result = validate({ days: days.slice(0, 1), expectedDayCount: 2 });

  assert.ok(codes(result).includes("day_count_mismatch"));
});

test("an item that is not a researched place fails validation", () => {
  const result = validate({ knownPlaceIds: ["s1"] });

  assert.ok(codes(result).includes("unknown_place"));
});

test("a day with no festival stop fails validation", () => {
  const foodOnly: DayRoute = {
    ...days[0],
    stops: days[0].stops
      .filter((stop) => stop.role === "food")
      .map((stop, index) => ({ ...stop, position: index })),
    festivalStopCount: 0,
    foodStopCount: days[0].stops.filter((stop) => stop.role === "food").length,
  };

  const result = validate({ days: [foodOnly, days[1]] });

  assert.ok(codes(result).includes("day_without_festival_stop"));
});

test("a restaurant-heavy day is rejected for a normal request", () => {
  const festival = days[0].stops.find((stop) => stop.role === "festival");
  assert.ok(festival);

  const foodStops = places
    .filter((place) => ["food", "restaurant", "cafe"].includes(place.type))
    .slice(0, 5)
    .map((place, index) => ({
      ...days[0].stops[0],
      placeId: place.id,
      name: place.name,
      placeType: place.type,
      itemType: "restaurant" as const,
      role: "food" as const,
      latitude: place.latitude,
      longitude: place.longitude,
      position: index + 1,
    }));

  const lopsided: DayRoute = {
    ...days[0],
    stops: [{ ...festival, position: 0 }, ...foodStops],
    festivalStopCount: 1,
    foodStopCount: foodStops.length,
  };

  const result = validate({ days: [lopsided, days[1]] });

  assert.ok(codes(result).includes("food_dominant_day"));
  assert.ok(codes(result).includes("food_stop_limit"));
});

test("the same place on two days is rejected", () => {
  const result = validate({ days: [days[0], { ...days[1], stops: days[0].stops }] });

  assert.ok(codes(result).includes("duplicate_place_in_plan"));
});

test("a route that leaves an area and returns is rejected", () => {
  const [first, second] = days;
  const mixed: DayRoute = {
    ...first,
    stops: [
      first.stops[0],
      { ...second.stops[0], position: 1 },
      { ...first.stops[1], position: 2 },
    ],
  };

  const result = validate({ days: [mixed, second] });

  assert.ok(codes(result).includes("route_backtracking"));
});

test("a walking day that spans distant areas is rejected", () => {
  const [first, second] = days;
  const tooWide: DayRoute = {
    ...first,
    transportMode: "walking",
    stops: [first.stops[0], { ...second.stops[0], position: 1 }],
  };

  const result = validate({ days: [tooWide, second] });

  assert.ok(codes(result).includes("day_area_incoherent"));
  assert.ok(codes(result).includes("duplicate_place_in_plan"));
});
