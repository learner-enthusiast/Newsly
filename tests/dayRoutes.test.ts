import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPlanningRegions } from "@/services/planner/areas";
import { buildDayRoutes } from "@/services/planner/dayRoutes";
import { haversineKm } from "@/services/planner/normalize/clusterAreas";
import { hasBacktracking } from "@/services/planner/validatePlan";
import { place, planningRequest, smallTown, twoClusterCity } from "./fixtures";

const festivalWindow = { festivalStart: "2026-10-16", festivalEnd: "2026-10-21" };

function build(requestOverrides = {}, places = twoClusterCity()) {
  return buildDayRoutes({
    request: planningRequest(requestOverrides),
    ...festivalWindow,
    places,
  });
}

test("a normal festival request is not restaurant-heavy", () => {
  const days = build();

  assert.equal(days.length, 2);

  for (const day of days) {
    assert.ok(
      day.festivalStopCount > day.foodStopCount,
      `day ${day.dayNumber} has ${day.festivalStopCount} festival vs ${day.foodStopCount} food stops`,
    );
    assert.ok(day.foodStopCount <= 2);
  }
});

test("every generated day contains meaningful festival stops", () => {
  const days = build();

  for (const day of days) {
    assert.ok(day.festivalStopCount >= 2);
    assert.ok(
      day.stops.some((stop) => stop.itemType === "pandal"),
      `day ${day.dayNumber} has no pandal stop`,
    );
  }
});

test("the requested number of days is always produced", () => {
  const days = build({ visitDates: null, durationDays: 3 });

  assert.equal(days.length, 3);
  assert.deepEqual(
    days.map((day) => day.dayNumber),
    [1, 2, 3],
  );
  assert.deepEqual(
    days.map((day) => day.date),
    ["2026-10-16", "2026-10-17", "2026-10-18"],
  );
});

test("food is inserted only where a meal window falls in the day", () => {
  const eveningOnly = build({ startTime: "17:00", endTime: "20:00" });
  const withDinner = build({ startTime: "17:00", endTime: "22:30" });

  const eveningFood = eveningOnly[0].stops.filter((stop) => stop.role === "food");
  const dinnerFood = withDinner[0].stops.filter((stop) => stop.role === "food");

  assert.ok(
    eveningFood.every((stop) => stop.mealWindow === "snack"),
    "a 5-8 PM day should only pick up the snack window",
  );
  assert.ok(
    dinnerFood.some((stop) => stop.mealWindow === "dinner"),
    "a day running to 10:30 PM should include dinner",
  );
});

test("a day that ends before any meal window gets no food stop", () => {
  const days = build({ startTime: "10:00", endTime: "11:45" });

  assert.equal(days[0].foodStopCount, 0);
});

test("a food-focused request intentionally allows more food stops", () => {
  const normal = build({ startTime: "11:00", endTime: "22:00" });
  const foodie = build({
    startTime: "11:00",
    endTime: "22:00",
    foodPreferences: ["street food crawl"],
  });

  const normalFood = normal[0].foodStopCount;
  const foodieFood = foodie[0].foodStopCount;

  assert.ok(normalFood <= 2);
  assert.ok(
    foodieFood > normalFood,
    `expected more food stops for a food crawl, got ${foodieFood} vs ${normalFood}`,
  );
});

test("a large city produces distinct area clusters per day", () => {
  const regions = buildPlanningRegions(
    twoClusterCity()
      .filter((item) => item.type === "pandal")
      .map((item) => ({
        id: item.id,
        name: item.name,
        area: item.area,
        address: item.address,
        city: item.city,
        latitude: item.latitude,
        longitude: item.longitude,
        rating: item.rating,
        reviewCount: item.reviewCount,
      })),
    { city: "Kolkata" },
  );

  assert.ok(regions.length >= 2, `expected multiple clusters, got ${regions.length}`);

  const days = build();
  const dayOne = new Set(days[0].stops.map((stop) => stop.placeId));
  const dayTwo = new Set(days[1].stops.map((stop) => stop.placeId));

  for (const id of dayOne) {
    assert.ok(!dayTwo.has(id), `${id} appears on both days`);
  }

  assert.notEqual(days[0].regionId, days[1].regionId);
});

test("a small town stays a single planning region", () => {
  const regions = buildPlanningRegions(
    smallTown().map((item) => ({
      id: item.id,
      name: item.name,
      area: item.area,
      address: item.address,
      city: item.city,
      latitude: item.latitude,
      longitude: item.longitude,
      rating: item.rating,
      reviewCount: item.reviewCount,
    })),
    { city: "Bishnupur" },
  );

  assert.equal(regions.length, 1);
});

test("stops are ordered by proximity and never backtrack", () => {
  const days = build();

  for (const day of days) {
    assert.ok(!hasBacktracking(day.stops), `day ${day.dayNumber} backtracks`);

    const festivalStops = day.stops.filter((stop) => stop.role === "festival");
    for (let index = 1; index < festivalStops.length; index += 1) {
      const previous = festivalStops[index - 1];
      const current = festivalStops[index];

      if (
        previous.latitude == null ||
        previous.longitude == null ||
        current.latitude == null ||
        current.longitude == null
      ) {
        continue;
      }

      const hop = haversineKm(
        { latitude: previous.latitude, longitude: previous.longitude },
        { latitude: current.latitude, longitude: current.longitude },
      );

      assert.ok(hop < 3, `hop of ${hop.toFixed(1)} km inside a cluster day`);
    }
  }
});

test("transport preference changes what the route is willing to travel", () => {
  const spread = [
    place("p1", "pandal", 22.505, 88.388),
    place("p2", "pandal", 22.507, 88.39),
    place("p3", "pandal", 22.62, 88.4),
    place("p4", "pandal", 22.63, 88.41),
  ];

  const walking = buildDayRoutes({
    request: planningRequest({
      visitDates: ["2026-10-16"],
      durationDays: 1,
      transport: "walking",
    }),
    ...festivalWindow,
    places: spread,
  });

  const cab = buildDayRoutes({
    request: planningRequest({
      visitDates: ["2026-10-16"],
      durationDays: 1,
      transport: "cab",
    }),
    ...festivalWindow,
    places: spread,
  });

  assert.equal(walking[0].transportMode, "walking");
  assert.equal(cab[0].transportMode, "cab");
  assert.ok(
    walking[0].travelKm <= cab[0].travelKm,
    "walking should not travel further than a cab route",
  );
  assert.ok(
    walking[0].stops.every(
      (stop) => (stop.travelKmFromPrevious ?? 0) <= 2.5,
    ),
    "walking legs must stay within the walking limit",
  );
});

test("duplicate places are never scheduled twice", () => {
  const duplicated = [...twoClusterCity(), ...twoClusterCity()];
  const days = buildDayRoutes({
    request: planningRequest(),
    ...festivalWindow,
    places: duplicated,
  });

  const seen = new Set<string>();
  for (const day of days) {
    for (const stop of day.stops) {
      assert.ok(!seen.has(stop.placeId), `${stop.placeId} scheduled twice`);
      seen.add(stop.placeId);
    }
  }
});

test("each stop carries a schedule and a route note", () => {
  const days = build({ startTime: "17:00", endTime: "22:00" });

  for (const stop of days[0].stops) {
    assert.ok(stop.startMinutes >= 17 * 60);
    assert.ok(stop.durationMinutes > 0);
    assert.ok(stop.note.length > 0);
  }
});
