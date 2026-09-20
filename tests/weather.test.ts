import assert from "node:assert/strict";
import { test } from "node:test";
import { getWeatherPlan } from "@/services/planner/research/serp";
import {
  alignWeatherToVisitDates,
  mapSerpWeather,
} from "@/services/planner/weather";

/** Mocked Google weather answer box with a single representative day. */
function singleDayResponse(date: string) {
  return {
    answer_box: {
      location: "Kolkata",
      date,
      temperature: 32,
      precipitation: "20%",
      weather: "Partly cloudy",
    },
  };
}

function sevenDayResponse() {
  return {
    weather_results: {
      location: "Kolkata",
      forecast: Array.from({ length: 7 }, (_, index) => ({
        date: `2026-10-${String(14 + index).padStart(2, "0")}`,
        temperature: { low: 25 + index, high: 32 + index },
        precipitation: "10%",
        weather: "Clear",
      })),
    },
  };
}

test("a 2-day request produces exactly 2 weather days", async () => {
  const visitDates = ["2026-10-16", "2026-10-17"];
  const plan = await getWeatherPlan({ city: "Kolkata", visitDates }, async (query) =>
    singleDayResponse(query.date ?? "2026-10-16"),
  );

  assert.equal(plan.days.length, 2);
  assert.deepEqual(
    plan.days.map((day) => day.date),
    visitDates,
  );
});

test("a 3-day request produces exactly 3 weather days", async () => {
  const visitDates = ["2026-10-16", "2026-10-17", "2026-10-18"];
  const plan = await getWeatherPlan({ city: "Kolkata", visitDates }, async (query) =>
    singleDayResponse(query.date ?? "2026-10-16"),
  );

  assert.equal(plan.days.length, 3);
});

test("weather dates match the visit dates in order, ignoring extra forecast days", async () => {
  const visitDates = ["2026-10-16", "2026-10-17"];
  const plan = await getWeatherPlan({ city: "Kolkata", visitDates }, async () =>
    sevenDayResponse(),
  );

  assert.deepEqual(
    plan.days.map((day) => day.date),
    visitDates,
  );
  assert.ok(plan.days.every((day) => day.forecastAvailable));
});

test("a date with no forecast keeps its day with null values", async () => {
  const visitDates = ["2027-10-16", "2027-10-17"];
  const plan = await getWeatherPlan({ city: "Kolkata", visitDates }, async () => ({}));

  assert.equal(plan.days.length, 2);
  assert.deepEqual(
    plan.days.map((day) => day.date),
    visitDates,
  );
  assert.ok(plan.days.every((day) => day.forecastAvailable === false));
  assert.ok(
    plan.days.every(
      (day) =>
        day.condition === null &&
        day.temperatureMax === null &&
        day.temperatureMin === null &&
        day.rainProbability === null,
    ),
  );
});

test("a failing weather lookup still yields a day per visit date", async () => {
  const visitDates = ["2026-10-16", "2026-10-17"];
  const plan = await getWeatherPlan({ city: "Kolkata", visitDates }, async () => {
    throw new Error("provider unavailable");
  });

  assert.equal(plan.days.length, 2);
  assert.ok(plan.days.every((day) => day.forecastAvailable === false));
});

test("alignment never drops or reorders a requested date", () => {
  const snapshot = mapSerpWeather(sevenDayResponse(), { location: "Kolkata" });
  const aligned = alignWeatherToVisitDates(snapshot.days, [
    "2026-10-17",
    "2026-10-16",
    "2026-11-01",
  ]);

  assert.deepEqual(
    aligned.map((day) => day.date),
    ["2026-10-17", "2026-10-16", "2026-11-01"],
  );
  assert.equal(aligned[2].forecastAvailable, false);
});
