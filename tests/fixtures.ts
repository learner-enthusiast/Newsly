import type { PlanningRequest } from "@/services/AIAgents.ts/planner-intake/schema";
import { emptyPlanningRequest } from "@/services/AIAgents.ts/planner-intake/schema";
import type { RoutablePlace } from "@/services/planner/dayRoutes";
import type { PlaceType } from "@/services/planner/normalize/placeType";

/** No test in this folder may call SerpApi, Firecrawl, an LLM, or the database. */
export function planningRequest(
  overrides: Partial<PlanningRequest> = {},
): PlanningRequest {
  return {
    ...emptyPlanningRequest(),
    festival: "Durga Puja",
    canonicalFestival: "Durga Puja",
    city: "Kolkata",
    year: 2026,
    visitDates: ["2026-10-16", "2026-10-17"],
    durationDays: 2,
    ...overrides,
  };
}

export function place(
  id: string,
  type: PlaceType,
  latitude: number,
  longitude: number,
  overrides: Partial<RoutablePlace> = {},
): RoutablePlace {
  return {
    id,
    name: `${type} ${id}`,
    type,
    address: `${id} Road, Kolkata, West Bengal 700001`,
    city: "Kolkata",
    area: null,
    latitude,
    longitude,
    rating: 4.2,
    reviewCount: 120,
    ...overrides,
  };
}

/**
 * Two dense festival clusters ~9 km apart plus food near each, which is the
 * shape a large-city research run produces.
 */
export function twoClusterCity(): RoutablePlace[] {
  const south = [
    place("s1", "pandal", 22.505, 88.388),
    place("s2", "pandal", 22.508, 88.392),
    place("s3", "pandal", 22.511, 88.386),
    place("s4", "pandal", 22.5135, 88.3905),
  ];
  const north = [
    place("n1", "pandal", 22.594, 88.379),
    place("n2", "pandal", 22.597, 88.3755),
    place("n3", "pandal", 22.5995, 88.3805),
    place("n4", "pandal", 22.602, 88.377),
  ];
  const food = [
    place("f1", "restaurant", 22.5095, 88.3895),
    place("f2", "food", 22.5115, 88.3875),
    place("f3", "restaurant", 22.5965, 88.3775),
    place("f4", "food", 22.5985, 88.3785),
    place("f5", "cafe", 22.5945, 88.3795),
  ];

  return [...south, ...north, ...food];
}

/** A small town: everything within ~2 km, so one planning region. */
export function smallTown(): RoutablePlace[] {
  return [
    place("t1", "pandal", 23.2405, 87.8615),
    place("t2", "pandal", 23.2425, 87.8645),
    place("t3", "pandal", 23.2445, 87.8595),
    place("t4", "temple", 23.2385, 87.863),
    place("t5", "restaurant", 23.2415, 87.8625),
    place("t6", "food", 23.2435, 87.8605),
  ];
}
