import { z } from "zod";
import { serpService } from "@/services/serpService";

export const placeTypeSchema = z.enum([
  "pandal",
  "temple",
  "food",
  "restaurant",
  "cafe",
  "parking",
  "restroom",
  "atm",
  "pharmacy",
  "event",
  "other",
]);

export const foodPlaceTypeSchema = z.enum(["food", "restaurant", "cafe"]);

export const normalizedPlaceSchema = z.object({
  name: z.string().min(1),
  type: placeTypeSchema.nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  area: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  googlePlaceId: z.string().nullable(),
  serpDataId: z.string().nullable(),
  rating: z.number().nullable(),
  reviewCount: z.number().int().nullable(),
  description: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  hours: z.unknown().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  sourceIds: z.array(z.string()),
});

export type PlaceType = z.output<typeof placeTypeSchema>;
export type FoodPlaceType = z.output<typeof foodPlaceTypeSchema>;
export type NormalizedPlace = z.output<typeof normalizedPlaceSchema>;

export type SerpMapsPlace = {
  place_id?: string;
  data_id?: string;
  title: string;
  address?: string;
  gps_coordinates?: { latitude?: number; longitude?: number };
  rating?: number;
  reviews?: number;
  description?: string;
  type?: string;
  thumbnail?: string;
  hours?: unknown;
  operating_hours?: unknown;
};

const TYPE_HINTS: Array<{ match: string; type: PlaceType }> = [
  { match: "pandal", type: "pandal" },
  { match: "temple", type: "temple" },
  { match: "cafe", type: "cafe" },
  { match: "coffee", type: "cafe" },
  { match: "restaurant", type: "restaurant" },
  { match: "food", type: "food" },
  { match: "stall", type: "food" },
  { match: "parking", type: "parking" },
  { match: "toilet", type: "restroom" },
  { match: "restroom", type: "restroom" },
  { match: "atm", type: "atm" },
  { match: "pharmacy", type: "pharmacy" },
  { match: "chemist", type: "pharmacy" },
  { match: "event", type: "event" },
];

export function mapSerpPlaceType(rawType: string | null | undefined): PlaceType | null {
  if (!rawType?.trim()) {
    return null;
  }

  const lowered = rawType.toLowerCase();
  return TYPE_HINTS.find(({ match }) => lowered.includes(match))?.type ?? "other";
}

export function mapsResultToInternalPlace(
  place: SerpMapsPlace,
  extras: {
    city?: string | null;
    area?: string | null;
    sourceIds?: string[];
  } = {},
): NormalizedPlace {
  const partial = serpService.normalizeMapsPlace.fn(place);
  const latitude = partial.latitude ?? null;
  const longitude = partial.longitude ?? null;
  const hasPair = latitude != null && longitude != null;

  return normalizedPlaceSchema.parse({
    name: partial.name,
    type: mapSerpPlaceType(partial.type),
    address: partial.address ?? null,
    city: extras.city ?? null,
    area: extras.area ?? null,
    latitude: hasPair ? latitude : null,
    longitude: hasPair ? longitude : null,
    googlePlaceId: place.place_id ?? null,
    serpDataId: place.data_id ?? null,
    rating: partial.rating ?? null,
    reviewCount: partial.reviewCount ?? null,
    description: partial.description ?? null,
    thumbnailUrl: partial.thumbnail ?? null,
    hours: place.hours ?? place.operating_hours ?? null,
    metadata: {
      source: partial.source,
      serpType: partial.type ?? null,
      externalId: partial.externalId || null,
    },
    sourceIds: extras.sourceIds ?? [],
  });
}

export function dropIncompleteCoordinates<T extends { latitude: number | null; longitude: number | null }>(
  place: T,
): T {
  if (place.latitude == null || place.longitude == null) {
    return { ...place, latitude: null, longitude: null };
  }

  return place;
}
