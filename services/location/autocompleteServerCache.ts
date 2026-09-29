import { getLogger } from "@/clients/logger";
import { fetchLocationAutocompleteFromDbCache } from "@/services/location/autocompleteDbCache";
import { pickFirstAutocompleteGeo } from "@/services/location/mapsAutocomplete";
import {
  buildServerMemoryCacheKey,
  coarseAutocompleteGeoKey,
  MIN_AUTOCOMPLETE_QUERY_LENGTH,
  normalizeAutocompleteQuery,
  SERVER_MEMORY_CACHE_TTL_MS,
} from "@/services/location/autocompleteQuery";
import type { LocationAutocompleteSuggestion } from "@/services/location/userLocationTypes";

type MemoryCacheEntry = {
  results: LocationAutocompleteSuggestion[];
  expiresAt: number;
};

const memoryCache = new Map<string, MemoryCacheEntry>();

function logMemoryCacheEvent(event: string, detail: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  getLogger().debug({ event, ...detail }, "location autocomplete memory cache");
}

/**
 * Autocomplete with L1 in-memory cache + persistent Postgres cache + SerpAPI.
 */
export async function fetchLocationAutocompleteCached(input: {
  q: string;
  latitude?: number;
  longitude?: number;
  cp?: number;
}): Promise<LocationAutocompleteSuggestion[]> {
  const trimmedQuery = input.q.trim();
  const normalizedQuery = normalizeAutocompleteQuery(trimmedQuery);
  if (normalizedQuery.length < MIN_AUTOCOMPLETE_QUERY_LENGTH) {
    return [];
  }

  const geoKey = coarseAutocompleteGeoKey(input.latitude, input.longitude);
  const memoryKey = buildServerMemoryCacheKey({ geoKey, normalizedQuery });

  const memoryHit = memoryCache.get(memoryKey);
  if (memoryHit && memoryHit.expiresAt > Date.now()) {
    logMemoryCacheEvent("AUTOCOMPLETE_SERVER_MEMORY_CACHE_HIT", {
      geoKey,
      queryLength: normalizedQuery.length,
    });
    return memoryHit.results;
  }

  const results = await fetchLocationAutocompleteFromDbCache(input);

  memoryCache.set(memoryKey, {
    results,
    expiresAt: Date.now() + SERVER_MEMORY_CACHE_TTL_MS,
  });

  return results;
}

export async function resolveCoordsFromFirstAutocompleteHit(
  query: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const suggestions = await fetchLocationAutocompleteCached({ q: query });
  return pickFirstAutocompleteGeo(suggestions);
}
