import { serpEngines } from "@/SERP/index";
import {
  formatLocationLabelFromSuggestion,
  formatLocationStorageValueFromSuggestion,
  isCoordinateLikeLocationValue,
  labelFromPostalAddress,
  searchLocationAutocomplete,
} from "@/services/location/mapsAutocomplete";
import type {
  LocationAutocompleteSuggestion,
  ResolvedUserLocation,
} from "@/services/location/userLocationTypes";

function scoreMetroCandidate(suggestion: LocationAutocompleteSuggestion): number {
  const valueParts = suggestion.value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  let score = valueParts.length * 3;
  if (suggestion.type === "keyword") {
    score += 8;
  }
  if (suggestion.subtext) {
    score += 1;
  }
  if (
    typeof suggestion.latitude === "number" &&
    typeof suggestion.longitude === "number"
  ) {
    score += 2;
  }
  return score;
}

function pickMetroSuggestion(
  suggestions: LocationAutocompleteSuggestion[],
): LocationAutocompleteSuggestion | null {
  const usable = suggestions.filter(
    (item) => !isCoordinateLikeLocationValue(item.value),
  );
  if (usable.length === 0) {
    return null;
  }
  const ranked = [...usable].sort(
    (a, b) => scoreMetroCandidate(b) - scoreMetroCandidate(a),
  );
  return ranked[0] ?? null;
}

function suggestionFromMapsLocalRow(
  row: Record<string, unknown>,
  fallbackLatitude: number,
  fallbackLongitude: number,
): LocationAutocompleteSuggestion | null {
  const address = typeof row.address === "string" ? row.address.trim() : "";
  if (!address) {
    return null;
  }
  const gps = row.gps_coordinates as
    | { latitude?: number; longitude?: number }
    | undefined;
  return {
    value: labelFromPostalAddress(address),
    subtext: address,
    type: "keyword",
    latitude: gps?.latitude ?? fallbackLatitude,
    longitude: gps?.longitude ?? fallbackLongitude,
    data_id: typeof row.data_id === "string" ? row.data_id : undefined,
  };
}

function pickBestMapsLocalSuggestion(
  localResults: unknown[],
  fallbackLatitude: number,
  fallbackLongitude: number,
): LocationAutocompleteSuggestion | null {
  const candidates: LocationAutocompleteSuggestion[] = [];
  for (const item of localResults) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const mapped = suggestionFromMapsLocalRow(
      item as Record<string, unknown>,
      fallbackLatitude,
      fallbackLongitude,
    );
    if (mapped) {
      candidates.push(mapped);
    }
  }
  if (candidates.length === 0) {
    return null;
  }
  return [...candidates].sort(
    (a, b) =>
      (b.value.split(",").length - a.value.split(",").length) ||
      scoreMetroCandidate(b) - scoreMetroCandidate(a),
  )[0]!;
}

function parseAdminFromSuggestion(
  suggestion: LocationAutocompleteSuggestion,
  fallbackLatitude: number,
  fallbackLongitude: number,
): Omit<ResolvedUserLocation, "suggestion"> {
  const latitude = suggestion.latitude ?? fallbackLatitude;
  const longitude = suggestion.longitude ?? fallbackLongitude;

  let metroCity: string | null = null;
  let state: string | null = null;
  let country: string | null = null;

  const valueParts = suggestion.value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (suggestion.type === "keyword" && valueParts.length > 0) {
    if (valueParts.length >= 3) {
      metroCity = valueParts[0] ?? null;
      state = valueParts[1] ?? null;
      country = valueParts.slice(2).join(", ") || null;
    } else if (valueParts.length === 2) {
      metroCity = valueParts[0] ?? null;
      state = valueParts[1] ?? null;
    } else {
      metroCity = valueParts[0] ?? null;
    }
  } else if (suggestion.subtext) {
    const subtextParts = suggestion.subtext
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (subtextParts.length >= 3) {
      metroCity = subtextParts[subtextParts.length - 3] ?? null;
      state = subtextParts[subtextParts.length - 2] ?? null;
      country = subtextParts[subtextParts.length - 1] ?? null;
    } else if (subtextParts.length === 2) {
      metroCity = subtextParts[0] ?? null;
      state = subtextParts[1] ?? null;
    } else if (subtextParts.length === 1) {
      metroCity = subtextParts[0] ?? null;
    }
  } else if (valueParts.length > 0) {
    metroCity = valueParts[0] ?? null;
  }

  return {
    latitude,
    longitude,
    label: formatLocationStorageValueFromSuggestion(suggestion),
    metroCity,
    state,
    country,
  };
}

/**
 * Resolve nearest metro / admin label for GPS coordinates via Serp Google Maps Autocomplete.
 */
export async function resolveUserLocationFromCoordinates(
  latitude: number,
  longitude: number,
): Promise<ResolvedUserLocation> {
  const coordinateQuery = `${latitude},${longitude}`;
  const queries = [
    "my location",
    "current location",
    coordinateQuery,
    `${latitude.toFixed(5)},${longitude.toFixed(5)}`,
  ];

  let suggestion: LocationAutocompleteSuggestion | null = null;
  for (const q of queries) {
    const suggestions = await searchLocationAutocomplete({
      q,
      latitude,
      longitude,
    });
    suggestion = pickMetroSuggestion(suggestions);
    if (suggestion) {
      break;
    }
  }

  if (!suggestion) {
    const mapsPayload = await serpEngines.searchGoogleMaps.fn({
      type: "search",
      lat: latitude,
      lon: longitude,
      z: 14,
      nearby: true,
      q: "city",
      hl: "en",
    });
    let localResults = (mapsPayload as { local_results?: unknown[] })
      .local_results;
    if (!Array.isArray(localResults) || localResults.length === 0) {
      const coordinateMapsPayload = await serpEngines.searchGoogleMaps.fn({
        type: "search",
        lat: latitude,
        lon: longitude,
        z: 14,
        nearby: true,
        q: coordinateQuery,
        hl: "en",
      });
      localResults = (coordinateMapsPayload as { local_results?: unknown[] })
        .local_results;
    }
    if (Array.isArray(localResults) && localResults.length > 0) {
      suggestion = pickBestMapsLocalSuggestion(
        localResults,
        latitude,
        longitude,
      );
    }
  }

  if (!suggestion) {
    return {
      latitude,
      longitude,
      label: "Unknown location",
      metroCity: null,
      state: null,
      country: null,
      suggestion: null,
    };
  }

  const parsed = parseAdminFromSuggestion(suggestion, latitude, longitude);
  return {
    ...parsed,
    label: formatLocationStorageValueFromSuggestion(suggestion),
    suggestion,
  };
}
