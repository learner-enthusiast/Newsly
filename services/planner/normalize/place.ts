import { z } from "zod";
import { serpService } from "@/services/serpService";
import { deriveAreaLabel } from "@/services/planner/normalize/areaLabel";
import {
  classifyPlaceType,
  mapRawPlaceType,
  placeTypeSchema,
  type DiscoveryIntent,
} from "@/services/planner/normalize/placeType";

export {
  foodPlaceTypeSchema,
  placeTypeSchema,
} from "@/services/planner/normalize/placeType";
export type {
  FoodPlaceType,
  PlaceType,
} from "@/services/planner/normalize/placeType";

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

/** Provider category only. Prefer `classifyPlaceType` for itinerary places. */
export const mapSerpPlaceType = mapRawPlaceType;

/**
 * Provider result → application place.
 *
 * The domain type comes from `classifyPlaceType`, which weighs the researched
 * festival context above the raw Google Maps category, and the area label is
 * derived from the address when the caller has no explicit area.
 */
export function mapsResultToInternalPlace(
  place: SerpMapsPlace,
  extras: {
    city?: string | null;
    area?: string | null;
    sourceIds?: string[];
    festivalTokens?: string[];
    discoveryIntent?: DiscoveryIntent;
    /** Researched text that mentions this venue, used for classification. */
    evidence?: string | null;
  } = {},
): NormalizedPlace {
  const partial = serpService.normalizeMapsPlace.fn(place);
  const latitude = partial.latitude ?? null;
  const longitude = partial.longitude ?? null;
  const hasPair = latitude != null && longitude != null;
  const address = partial.address ?? null;

  const classification = classifyPlaceType({
    name: partial.name,
    rawType: partial.type ?? null,
    description: partial.description ?? null,
    evidence: extras.evidence ?? null,
    festivalTokens: extras.festivalTokens,
    discoveryIntent: extras.discoveryIntent,
  });

  return normalizedPlaceSchema.parse({
    name: partial.name,
    type: classification.type,
    address,
    city: extras.city ?? null,
    area: extras.area ?? deriveAreaLabel(address, extras.city),
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
      classification: classification.reasons,
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
