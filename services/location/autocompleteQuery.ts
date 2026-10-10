import { formatLocationLabelFromSuggestion } from "@/services/location/mapsAutocomplete";
import type { LocationAutocompleteSuggestion } from "@/services/location/userLocationTypes";

export const MIN_AUTOCOMPLETE_QUERY_LENGTH = 2;
export const AUTOCOMPLETE_DEBOUNCE_MS = 5000;
export const CLIENT_CACHE_TTL_MS = 5 * 60 * 1000;
/** Short-lived process memory cache (L1) in front of Postgres. */
export const SERVER_MEMORY_CACHE_TTL_MS = 5 * 60 * 1000;
export const AUTOCOMPLETE_CACHE_TTL_DAYS = 14;
export const AUTOCOMPLETE_PROVIDER_NAME = "serpapi";
export const AUTOCOMPLETE_HL = "en";
export const MAX_CLIENT_CACHE_ENTRIES = 100;
export const MIN_PREFIX_FILTERED_RESULTS = 5;

export function normalizeAutocompleteQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

/** ~11km grid — balances cache reuse with location bias accuracy. */
export function coarseAutocompleteGeoKey(
  latitude?: number,
  longitude?: number,
): string {
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return "default";
  }
  return `${latitude.toFixed(1)}_${longitude.toFixed(1)}`;
}

export function buildClientAutocompleteCacheKey(
  geoKey: string,
  normalizedQuery: string,
): string {
  return `${geoKey}:${normalizedQuery}`;
}

export function buildAutocompleteDbProvider(geoKey: string): string {
  return `${AUTOCOMPLETE_PROVIDER_NAME}:${AUTOCOMPLETE_HL}:${geoKey}`;
}

export function buildServerMemoryCacheKey(input: {
  geoKey: string;
  normalizedQuery: string;
}): string {
  return `${buildAutocompleteDbProvider(input.geoKey)}:${input.normalizedQuery}`;
}

/** Longest cached prefix first (e.g. kolkata → kolkat, kolka, …, ko). */
export function autocompletePrefixQueries(normalizedQuery: string): string[] {
  const prefixes: string[] = [];
  for (
    let length = normalizedQuery.length - 1;
    length >= MIN_AUTOCOMPLETE_QUERY_LENGTH;
    length -= 1
  ) {
    prefixes.push(normalizedQuery.slice(0, length));
  }
  return prefixes;
}

export function autocompleteCacheExpiresAt(from = new Date()): Date {
  const expires = new Date(from);
  expires.setUTCDate(expires.getUTCDate() + AUTOCOMPLETE_CACHE_TTL_DAYS);
  return expires;
}

export function normalizeSuggestionSearchText(
  suggestion: LocationAutocompleteSuggestion,
): string {
  const label = formatLocationLabelFromSuggestion(suggestion);
  return [suggestion.value, suggestion.subtext, label]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function filterCachedSuggestionsForQuery(
  results: LocationAutocompleteSuggestion[],
  normalizedQuery: string,
): LocationAutocompleteSuggestion[] {
  if (!normalizedQuery) {
    return results;
  }
  return results.filter((suggestion) =>
    normalizeSuggestionSearchText(suggestion).includes(normalizedQuery),
  );
}
