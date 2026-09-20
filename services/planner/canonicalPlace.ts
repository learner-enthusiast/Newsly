import { createPlaceSource } from "@/repositories/placeSource";
import { upsertPlace } from "@/repositories/place";
import {
  mapsResultToInternalPlace,
  type NormalizedPlace,
  type SerpMapsPlace,
} from "@/services/planner/normalize/place";
import {
  placeTypeToPlanItemType,
  type DiscoveryIntent,
  type PlaceType,
  type PlanItemType,
} from "@/services/planner/normalize/placeType";

export { placeTypeToPlanItemType };
export type { PlanItemType };

export type CanonicalPlace = {
  id: string;
  name: string;
  type: PlaceType;
  address: string | null;
  city: string | null;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
  googlePlaceId: string | null;
  serpDataId: string | null;
  rating: number | null;
  reviewCount: number | null;
  description: string | null;
  thumbnailUrl: string | null;
};

export type MapsPlaceRecord = {
  title: string;
  address?: string;
  place_id?: string;
  data_id?: string;
  gps_coordinates?: { latitude?: number; longitude?: number };
  rating?: number;
  reviews?: number;
  description?: string;
  type?: string;
  thumbnail?: string;
  hours?: unknown;
  operating_hours?: unknown;
  link?: string;
};

function toCoordNumber(value: unknown): number | null {
  if (value == null) {
    return null;
  }

  if (
    typeof value === "object" &&
    "toNumber" in value &&
    typeof (value as { toNumber?: unknown }).toNumber === "function"
  ) {
    const parsed = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(parsed) ? parsed : null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

export function mapsPlaceRecords(values: unknown[]): MapsPlaceRecord[] {
  const records: MapsPlaceRecord[] = [];

  for (const value of values) {
    if (!value || typeof value !== "object") {
      continue;
    }

    const record = value as Record<string, unknown>;
    const title = asString(record.title);
    if (!title) {
      continue;
    }

    const gps = record.gps_coordinates;
    const coordinates =
      gps && typeof gps === "object"
        ? {
            latitude: asNumber((gps as { latitude?: unknown }).latitude),
            longitude: asNumber((gps as { longitude?: unknown }).longitude),
          }
        : undefined;

    records.push({
      title,
      address: asString(record.address),
      place_id: asString(record.place_id),
      data_id: asString(record.data_id),
      gps_coordinates: coordinates,
      rating: asNumber(record.rating),
      reviews: asNumber(record.reviews),
      description: asString(record.description),
      type: asString(record.type),
      thumbnail: asString(record.thumbnail),
      hours: record.hours,
      operating_hours: record.operating_hours,
      link: asString(record.link),
    });
  }

  return records;
}

export function mapsRecordToSerpPlace(place: MapsPlaceRecord): SerpMapsPlace {
  return {
    title: place.title,
    address: place.address,
    place_id: place.place_id,
    data_id: place.data_id,
    gps_coordinates: place.gps_coordinates,
    rating: place.rating,
    reviews: place.reviews,
    description: place.description,
    type: place.type,
    thumbnail: place.thumbnail,
    hours: place.hours,
    operating_hours: place.operating_hours,
  };
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function canUpsertPlace(place: NormalizedPlace) {
  if (place.googlePlaceId || place.serpDataId) {
    return true;
  }

  return Boolean(
    place.address && place.latitude != null && place.longitude != null,
  );
}

/**
 * The agent may only upgrade a generic provider category into a researched
 * festival type. It can never turn a food venue into a pandal, or overwrite a
 * category the maps result already states confidently.
 */
function resolveType(
  mapsType: PlaceType | null,
  agentType: PlaceType | null,
): PlaceType | null {
  if (!agentType) {
    return mapsType;
  }

  if (!mapsType || mapsType === "other") {
    return agentType;
  }

  if (
    agentType === "pandal" &&
    (mapsType === "temple" || mapsType === "event")
  ) {
    return "pandal";
  }

  return mapsType;
}

function overlayAgentFields(
  mapsPlace: NormalizedPlace,
  agentPlaces: NormalizedPlace[],
): NormalizedPlace {
  const match = agentPlaces.find((candidate) => {
    if (
      mapsPlace.googlePlaceId &&
      candidate.googlePlaceId === mapsPlace.googlePlaceId
    ) {
      return true;
    }

    if (mapsPlace.serpDataId && candidate.serpDataId === mapsPlace.serpDataId) {
      return true;
    }

    return normalizeName(mapsPlace.name) === normalizeName(candidate.name);
  });

  if (!match) {
    return mapsPlace;
  }

  return {
    ...mapsPlace,
    description: mapsPlace.description ?? match.description,
    area: mapsPlace.area ?? match.area,
    type: resolveType(mapsPlace.type, match.type),
  };
}

function toCanonicalPlace(place: {
  id: string;
  name: string;
  type: PlaceType;
  address: string | null;
  city: string | null;
  area: string | null;
  latitude: unknown;
  longitude: unknown;
  googlePlaceId: string | null;
  serpDataId: string | null;
  rating: unknown;
  reviewCount: number | null;
  description: string | null;
  thumbnailUrl: string | null;
}): CanonicalPlace {
  return {
    id: place.id,
    name: place.name,
    type: place.type,
    address: place.address,
    city: place.city,
    area: place.area,
    latitude: toCoordNumber(place.latitude),
    longitude: toCoordNumber(place.longitude),
    googlePlaceId: place.googlePlaceId,
    serpDataId: place.serpDataId,
    rating: toCoordNumber(place.rating),
    reviewCount: place.reviewCount,
    description: place.description,
    thumbnailUrl: place.thumbnailUrl,
  };
}

export function placeSnapshot(place: CanonicalPlace) {
  return {
    id: place.id,
    name: place.name,
    type: place.type,
    address: place.address,
    city: place.city,
    area: place.area,
    latitude: place.latitude,
    longitude: place.longitude,
    googlePlaceId: place.googlePlaceId,
    rating: place.rating,
    reviewCount: place.reviewCount,
    description: place.description,
    thumbnailUrl: place.thumbnailUrl,
  };
}

/**
 * Pulls the sentence(s) around a venue name out of the research corpus so the
 * classifier can see, for example, "... Gauri Bari Sarbojanin Durga Puja
 * pandal ..." before deciding the place is a pandal rather than a temple.
 */
export function evidenceForPlace(
  name: string,
  corpus: string,
  window = 240,
): string | null {
  const needle = name.trim().toLowerCase();
  if (needle.length < 4 || !corpus) {
    return null;
  }

  const haystack = corpus.toLowerCase();
  const index = haystack.indexOf(needle);
  if (index === -1) {
    return null;
  }

  return corpus
    .slice(Math.max(0, index - window), index + needle.length + window)
    .replace(/\s+/g, " ")
    .trim();
}

export function mapsContentForAgent(places: MapsPlaceRecord[]) {
  return places
    .map((place) =>
      [place.title, place.address, place.description, place.type]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

export async function upsertMapsPlaces(params: {
  mapsPlaces: MapsPlaceRecord[];
  agentPlaces: NormalizedPlace[];
  city: string;
  area?: string | null;
  fallbackType: PlaceType;
  sourceId: string | null;
  /** Discriminating festival words, e.g. ["durga"] for Durga Puja. */
  festivalTokens?: string[];
  discoveryIntent?: DiscoveryIntent;
  /** Concatenated research text used as classification evidence. */
  researchCorpus?: string;
}): Promise<CanonicalPlace[]> {
  const upserted: CanonicalPlace[] = [];

  for (const mapsPlace of params.mapsPlaces) {
    const normalized = overlayAgentFields(
      mapsResultToInternalPlace(mapsRecordToSerpPlace(mapsPlace), {
        city: params.city,
        area: params.area ?? null,
        sourceIds: params.sourceId ? [params.sourceId] : [],
        festivalTokens: params.festivalTokens,
        discoveryIntent: params.discoveryIntent,
        evidence: params.researchCorpus
          ? evidenceForPlace(mapsPlace.title, params.researchCorpus)
          : null,
      }),
      params.agentPlaces,
    );

    if (!canUpsertPlace(normalized)) {
      continue;
    }

    const place = await upsertPlace({
      name: normalized.name,
      type: normalized.type ?? params.fallbackType,
      address: normalized.address,
      city: normalized.city ?? params.city,
      area: normalized.area,
      latitude: normalized.latitude,
      longitude: normalized.longitude,
      googlePlaceId: normalized.googlePlaceId,
      serpDataId: normalized.serpDataId,
      rating: normalized.rating,
      reviewCount: normalized.reviewCount,
      description: normalized.description,
      thumbnailUrl: normalized.thumbnailUrl,
      hours: normalized.hours,
      metadata: normalized.metadata,
      lastVerifiedAt: new Date(),
    });

    const canonical = toCanonicalPlace(place);
    upserted.push(canonical);

    if (params.sourceId) {
      await createPlaceSource({
        placeId: canonical.id,
        sourceId: params.sourceId,
        relationshipType: "location",
      });
    }
  }

  return upserted;
}
