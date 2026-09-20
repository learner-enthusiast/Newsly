import { deriveAreaLabel } from "@/services/planner/normalize/areaLabel";
import {
  clusterPlacesByArea,
  haversineKm,
} from "@/services/planner/normalize/clusterAreas";
import { PLANNING_RULES } from "@/services/planner/planningRules";

/**
 * City → area/cluster discovery.
 *
 * Regions are derived from the researched places themselves (coordinates,
 * density, address localities). There is no hardcoded locality list and no
 * "north beats south" ranking anywhere: a big, spread-out city produces
 * several regions, a small town stays a single planning region.
 */
export type RegionPlace = {
  id: string;
  name: string;
  area: string | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  reviewCount: number | null;
};

export type PlanningRegion = {
  id: string;
  label: string | null;
  centroid: { latitude: number; longitude: number } | null;
  spreadKm: number;
  /** Places per km² of the bounding circle — high means easy hopping. */
  density: number;
  score: number;
  places: RegionPlace[];
};

export type BuildRegionsOptions = {
  city?: string | null;
  clusterRadiusKm?: number;
  minPlacesPerRegion?: number;
  singleRegionMaxSpreadKm?: number;
  minPlacesForMultipleRegions?: number;
};

function located(place: RegionPlace): place is RegionPlace & {
  latitude: number;
  longitude: number;
} {
  return place.latitude != null && place.longitude != null;
}

export function centroidOf(places: RegionPlace[]) {
  const points = places.filter(located);
  if (points.length === 0) {
    return null;
  }

  const total = points.reduce(
    (sum, place) => ({
      latitude: sum.latitude + place.latitude,
      longitude: sum.longitude + place.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );

  return {
    latitude: total.latitude / points.length,
    longitude: total.longitude / points.length,
  };
}

export function spreadKm(places: RegionPlace[]) {
  const centroid = centroidOf(places);
  if (!centroid) {
    return 0;
  }

  return places
    .filter(located)
    .reduce((max, place) => Math.max(max, haversineKm(place, centroid)), 0);
}

function labelFor(places: RegionPlace[], city?: string | null) {
  const counts = new Map<string, number>();

  for (const place of places) {
    const label =
      place.area?.trim() || deriveAreaLabel(place.address, city ?? place.city);
    if (!label) {
      continue;
    }

    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  let winner: string | null = null;
  let best = 0;

  for (const [label, count] of counts) {
    if (count > best) {
      winner = label;
      best = count;
    }
  }

  return winner;
}

function qualitySignal(places: RegionPlace[]) {
  const rated = places.filter((place) => place.rating != null);
  if (rated.length === 0) {
    return 0;
  }

  const average =
    rated.reduce((sum, place) => sum + (place.rating ?? 0), 0) / rated.length;

  return average / 5;
}

function toRegion(
  id: string,
  places: RegionPlace[],
  city?: string | null,
): PlanningRegion {
  const centroid = centroidOf(places);
  const spread = spreadKm(places);
  const area = Math.PI * Math.max(spread, 0.4) ** 2;
  const density = places.length / area;

  return {
    id,
    label: labelFor(places, city),
    centroid,
    spreadKm: spread,
    density,
    // Place count dominates (a cluster is only worth a day if it has enough
    // festival stops), density rewards walkable clusters, quality is a nudge.
    score: places.length + density * 0.8 + qualitySignal(places) * 2,
    places,
  };
}

/**
 * Groups places into coherent planning regions. Returns a single region when
 * the destination is small or the places sit close together.
 */
export function buildPlanningRegions(
  places: RegionPlace[],
  options: BuildRegionsOptions = {},
): PlanningRegion[] {
  if (places.length === 0) {
    return [];
  }

  const minPlacesPerRegion =
    options.minPlacesPerRegion ?? PLANNING_RULES.minPlacesPerRegion;
  const minForMultiple =
    options.minPlacesForMultipleRegions ??
    PLANNING_RULES.minFestivalPlacesForMultipleRegions;
  const maxSingleSpread =
    options.singleRegionMaxSpreadKm ?? PLANNING_RULES.singleRegionMaxSpreadKm;

  const overallSpread = spreadKm(places);

  if (places.length < minForMultiple || overallSpread <= maxSingleSpread) {
    return [toRegion("region-1", places, options.city)];
  }

  const clusters = clusterPlacesByArea(
    places.map((place) => ({
      latitude: place.latitude,
      longitude: place.longitude,
      area: place.area ?? deriveAreaLabel(place.address, options.city ?? place.city),
    })),
    options.clusterRadiusKm ?? PLANNING_RULES.clusterRadiusKm,
  );

  const groups = clusters.map((cluster) =>
    cluster.placeIndexes
      .map((index) => places[index])
      .filter((place): place is RegionPlace => place != null),
  );

  // Fold thin clusters into their nearest neighbour so we never invent
  // "Area A / Area B / Area C" out of one or two stray places.
  const kept: RegionPlace[][] = [];
  const strays: RegionPlace[] = [];

  for (const group of groups) {
    if (group.length >= minPlacesPerRegion) {
      kept.push(group);
      continue;
    }

    strays.push(...group);
  }

  if (kept.length === 0) {
    return [toRegion("region-1", places, options.city)];
  }

  for (const stray of strays) {
    const target = located(stray)
      ? kept.reduce((best, group) => {
          const bestCentroid = centroidOf(best);
          const groupCentroid = centroidOf(group);
          if (!groupCentroid) {
            return best;
          }
          if (!bestCentroid) {
            return group;
          }

          return haversineKm(stray, groupCentroid) < haversineKm(stray, bestCentroid)
            ? group
            : best;
        }, kept[0])
      : kept[0];

    target.push(stray);
  }

  return kept
    .map((group, index) => toRegion(`region-${index + 1}`, group, options.city))
    .sort((left, right) => right.score - left.score)
    .map((region, index) => ({ ...region, id: `region-${index + 1}` }));
}

/**
 * Splits one region along its widest geographic axis, used when a city has
 * fewer distinct clusters than the trip has days.
 */
export function splitRegion(
  region: PlanningRegion,
  parts: number,
  city?: string | null,
): PlanningRegion[] {
  if (parts <= 1 || region.places.length < parts) {
    return [region];
  }

  const points = region.places.filter(located);
  const rest = region.places.filter((place) => !located(place));

  if (points.length < parts) {
    return [region];
  }

  const latSpan =
    Math.max(...points.map((place) => place.latitude)) -
    Math.min(...points.map((place) => place.latitude));
  const lngSpan =
    Math.max(...points.map((place) => place.longitude)) -
    Math.min(...points.map((place) => place.longitude));

  const sorted = [...points].sort((left, right) =>
    latSpan >= lngSpan
      ? left.latitude - right.latitude
      : left.longitude - right.longitude,
  );

  const chunkSize = Math.ceil(sorted.length / parts);
  const chunks: RegionPlace[][] = [];

  for (let index = 0; index < sorted.length; index += chunkSize) {
    chunks.push(sorted.slice(index, index + chunkSize));
  }

  if (rest.length > 0 && chunks.length > 0) {
    chunks[0].push(...rest);
  }

  return chunks.map((chunk, index) =>
    toRegion(`${region.id}-${index + 1}`, chunk, city),
  );
}
