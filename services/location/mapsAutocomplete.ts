import { serpEngines } from "@/SERP/index";
import type { LocationAutocompleteSuggestion } from "@/services/location/userLocationTypes";

/** Default map center (India) when browser GPS is unavailable. */
export const DEFAULT_MAPS_AUTOCOMPLETE_LL = "@20.5937,78.9629,5z";

export function formatSerpLl(
  latitude: number,
  longitude: number,
  zoom = 12,
): string {
  return `@${latitude},${longitude},${zoom}z`;
}

export function resolveAutocompleteLl(input?: {
  latitude?: number;
  longitude?: number;
}): string {
  if (
    typeof input?.latitude === "number" &&
    typeof input?.longitude === "number"
  ) {
    return formatSerpLl(input.latitude, input.longitude);
  }
  return DEFAULT_MAPS_AUTOCOMPLETE_LL;
}

export function extractAutocompleteSuggestions(
  payload: unknown,
): LocationAutocompleteSuggestion[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const raw = (payload as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(raw)) {
    return [];
  }

  const out: LocationAutocompleteSuggestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const value = typeof record.value === "string" ? record.value.trim() : "";
    if (!value) {
      continue;
    }
    out.push({
      value,
      subtext:
        typeof record.subtext === "string" ? record.subtext.trim() : undefined,
      type: typeof record.type === "string" ? record.type : undefined,
      latitude:
        typeof record.latitude === "number" ? record.latitude : undefined,
      longitude:
        typeof record.longitude === "number" ? record.longitude : undefined,
      data_id: typeof record.data_id === "string" ? record.data_id : undefined,
      serpapi_link:
        typeof record.serpapi_link === "string" ? record.serpapi_link : undefined,
      maps_serpapi_link:
        typeof record.maps_serpapi_link === "string"
          ? record.maps_serpapi_link
          : undefined,
      reviews_serpapi_link:
        typeof record.reviews_serpapi_link === "string"
          ? record.reviews_serpapi_link
          : undefined,
      photos_serpapi_link:
        typeof record.photos_serpapi_link === "string"
          ? record.photos_serpapi_link
          : undefined,
    });
  }
  return out;
}

/** True when Serp returns a raw coordinate string instead of a place name. */
export function isCoordinateLikeLocationValue(value: string): boolean {
  const trimmed = value.trim();
  return /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?(?:\s*,?\s*\d+z?)?$/i.test(
    trimmed,
  );
}

/** Build "City, State, Country" from a Google Maps postal-style address line. */
export function labelFromPostalAddress(address: string): string {
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return address.trim();
  }
  if (parts.length === 1) {
    return parts[0]!;
  }
  if (parts.length === 2) {
    return parts.join(", ");
  }

  const country = parts[parts.length - 1]!;
  const stateRaw = parts[parts.length - 2] ?? "";
  const state = stateRaw.replace(/\s*\d[\d\s-]*$/, "").trim() || stateRaw;
  const city = parts[parts.length - 3] ?? parts[0]!;
  return [city, state, country].filter(Boolean).join(", ");
}

export function formatLocationLabelFromSuggestion(
  suggestion: LocationAutocompleteSuggestion,
): string {
  if (isCoordinateLikeLocationValue(suggestion.value)) {
    if (suggestion.subtext) {
      return labelFromPostalAddress(suggestion.subtext);
    }
    return suggestion.value;
  }
  if (suggestion.type === "keyword") {
    return suggestion.value;
  }
  if (suggestion.subtext) {
    const parts = suggestion.subtext
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      return parts.slice(-Math.min(3, parts.length)).join(", ");
    }
    return suggestion.subtext;
  }
  return suggestion.value;
}

function rankLocationSuggestion(
  suggestion: LocationAutocompleteSuggestion,
): number {
  let score = 0;
  if (suggestion.type === "keyword") {
    score += 10;
  }
  const commaParts = suggestion.value.split(",").length;
  score += commaParts * 2;
  if (suggestion.subtext) {
    score += 1;
  }
  return score;
}

export function sortLocationSuggestions(
  suggestions: LocationAutocompleteSuggestion[],
): LocationAutocompleteSuggestion[] {
  return [...suggestions].sort(
    (a, b) => rankLocationSuggestion(b) - rankLocationSuggestion(a),
  );
}

export async function searchLocationAutocomplete(input: {
  q: string;
  latitude?: number;
  longitude?: number;
  cp?: number;
}): Promise<LocationAutocompleteSuggestion[]> {
  const query = input.q.trim();
  if (!query) {
    return [];
  }

  const payload = await serpEngines.searchGoogleMapsAutocomplete.fn({
    q: query,
    ll: resolveAutocompleteLl(input),
    ...(typeof input.cp === "number" ? { cp: input.cp } : {}),
    hl: "en",
  });

  return sortLocationSuggestions(extractAutocompleteSuggestions(payload));
}
