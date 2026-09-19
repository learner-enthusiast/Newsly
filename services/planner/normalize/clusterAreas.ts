export type ClusterablePlace = {
  latitude?: number | null;
  longitude?: number | null;
  area?: string | null;
};

export type PlaceCluster = {
  id: string;
  centroid: { latitude: number; longitude: number } | null;
  area: string | null;
  placeIndexes: number[];
};

const EARTH_RADIUS_KM = 6371;
const DEFAULT_RADIUS_KM = 1.5;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function haversineKm(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
) {
  const dLat = toRadians(right.latitude - left.latitude);
  const dLng = toRadians(right.longitude - left.longitude);
  const lat1 = toRadians(left.latitude);
  const lat2 = toRadians(right.latitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function normalizeArea(area: string | null | undefined) {
  const trimmed = area?.trim().toLowerCase().replace(/\s+/g, " ");
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function averageCentroid(
  points: Array<{ latitude: number; longitude: number }>,
) {
  const total = points.reduce(
    (sum, point) => ({
      latitude: sum.latitude + point.latitude,
      longitude: sum.longitude + point.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );

  return {
    latitude: total.latitude / points.length,
    longitude: total.longitude / points.length,
  };
}

function mostCommonArea(
  places: ClusterablePlace[],
  indexes: number[],
) {
  const counts = new Map<string, number>();

  for (const index of indexes) {
    const area = normalizeArea(places[index]?.area);
    if (!area) {
      continue;
    }

    counts.set(area, (counts.get(area) ?? 0) + 1);
  }

  let winner: string | null = null;
  let max = 0;

  for (const [area, count] of counts) {
    if (count > max) {
      winner = area;
      max = count;
    }
  }

  return winner;
}

/**
 * Deterministic clustering by coordinates (greedy nearest-centroid) then by
 * normalized area labels for places without coordinates. Clusters are ordered
 * by size, then centroid latitude/longitude — never by hardcoded locality names.
 */
export function clusterPlacesByArea(
  places: ClusterablePlace[],
  radiusKm = DEFAULT_RADIUS_KM,
): PlaceCluster[] {
  const geoClusters: Array<{
    points: Array<{ latitude: number; longitude: number }>;
    placeIndexes: number[];
  }> = [];
  const unlocatedByArea = new Map<string, number[]>();
  const unlocatedUnknown: number[] = [];

  places.forEach((place, index) => {
    if (place.latitude == null || place.longitude == null) {
      const area = normalizeArea(place.area) ?? "unlocated";
      const bucket = area === "unlocated" ? unlocatedUnknown : unlocatedByArea.get(area);
      if (area === "unlocated") {
        unlocatedUnknown.push(index);
        return;
      }

      if (bucket) {
        bucket.push(index);
        return;
      }

      unlocatedByArea.set(area, [index]);
      return;
    }

    const point = { latitude: place.latitude, longitude: place.longitude };
    let nearest: (typeof geoClusters)[number] | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const cluster of geoClusters) {
      const centroid = averageCentroid(cluster.points);
      const distance = haversineKm(point, centroid);
      if (distance < nearestDistance) {
        nearest = cluster;
        nearestDistance = distance;
      }
    }

    if (nearest && nearestDistance <= radiusKm) {
      nearest.points.push(point);
      nearest.placeIndexes.push(index);
      return;
    }

    geoClusters.push({
      points: [point],
      placeIndexes: [index],
    });
  });

  const clusters: PlaceCluster[] = [
    ...geoClusters.map((cluster, index) => ({
      id: `geo-${index + 1}`,
      centroid: averageCentroid(cluster.points),
      area: mostCommonArea(places, cluster.placeIndexes),
      placeIndexes: cluster.placeIndexes,
    })),
    ...[...unlocatedByArea.entries()].map(([area, placeIndexes], index) => ({
      id: `area-${index + 1}`,
      centroid: null,
      area,
      placeIndexes,
    })),
  ];

  if (unlocatedUnknown.length > 0) {
    clusters.push({
      id: "unlocated",
      centroid: null,
      area: null,
      placeIndexes: unlocatedUnknown,
    });
  }

  return clusters.sort((left, right) => {
    const sizeDiff = right.placeIndexes.length - left.placeIndexes.length;
    if (sizeDiff !== 0) {
      return sizeDiff;
    }

    const leftLat = left.centroid?.latitude ?? Number.POSITIVE_INFINITY;
    const rightLat = right.centroid?.latitude ?? Number.POSITIVE_INFINITY;
    if (leftLat !== rightLat) {
      return leftLat - rightLat;
    }

    const leftLng = left.centroid?.longitude ?? Number.POSITIVE_INFINITY;
    const rightLng = right.centroid?.longitude ?? Number.POSITIVE_INFINITY;
    return leftLng - rightLng;
  });
}
