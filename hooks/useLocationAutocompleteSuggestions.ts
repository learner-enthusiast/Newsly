"use client";

import {
  peekClientAutocompleteResolution,
  setClientAutocompleteCache,
} from "@/lib/location/autocompleteClientCache";
import {
  AUTOCOMPLETE_DEBOUNCE_MS,
  coarseAutocompleteGeoKey,
  MIN_AUTOCOMPLETE_QUERY_LENGTH,
  normalizeAutocompleteQuery,
} from "@/services/location/autocompleteQuery";
import type {
  LocationAutocompleteSuggestion,
  LocationGeoAnchor,
} from "@/services/location/userLocationTypes";
import { useEffect, useMemo, useRef, useState } from "react";

type AutocompleteApiResponse = {
  suggestions?: LocationAutocompleteSuggestion[];
  error?: string;
};

type ResolutionKind = "none" | "instant" | "fetch";

export function useLocationAutocompleteSuggestions(
  query: string,
  geoAnchor: LocationGeoAnchor | null,
) {
  const [fetchedSuggestions, setFetchedSuggestions] = useState<
    LocationAutocompleteSuggestion[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestGenerationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const trimmedQuery = query.trim();
  const normalizedQuery = normalizeAutocompleteQuery(trimmedQuery);
  const geoKey = coarseAutocompleteGeoKey(
    geoAnchor?.latitude,
    geoAnchor?.longitude,
  );

  const resolution = useMemo((): {
    kind: ResolutionKind;
    suggestions: LocationAutocompleteSuggestion[];
  } => {
    if (normalizedQuery.length < MIN_AUTOCOMPLETE_QUERY_LENGTH) {
      return { kind: "none", suggestions: [] };
    }
    const instant = peekClientAutocompleteResolution(geoKey, normalizedQuery);
    if (instant) {
      return { kind: "instant", suggestions: instant };
    }
    return { kind: "fetch", suggestions: [] };
  }, [geoKey, normalizedQuery]);

  useEffect(() => {
    if (resolution.kind !== "fetch") {
      abortRef.current?.abort();
      return;
    }

    const generation = ++requestGenerationRef.current;
    const timer = window.setTimeout(() => {
      if (generation !== requestGenerationRef.current) {
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setFetchedSuggestions([]);
      setLoading(true);
      setError(null);

      async function loadFromServer() {
        try {
          const params = new URLSearchParams({ q: trimmedQuery });
          if (geoAnchor) {
            params.set("latitude", String(geoAnchor.latitude));
            params.set("longitude", String(geoAnchor.longitude));
          }
          params.set("cp", String(trimmedQuery.length));

          const response = await fetch(
            `/api/location/autocomplete?${params.toString()}`,
            { signal: controller.signal },
          );
          const payload = (await response.json()) as AutocompleteApiResponse;
          if (!response.ok) {
            throw new Error(payload.error ?? "Autocomplete failed");
          }
          if (
            controller.signal.aborted ||
            generation !== requestGenerationRef.current
          ) {
            return;
          }

          const nextSuggestions = payload.suggestions ?? [];
          setClientAutocompleteCache(geoKey, trimmedQuery, nextSuggestions);
          setFetchedSuggestions(nextSuggestions);
        } catch (err) {
          if (controller.signal.aborted) {
            return;
          }
          if (generation !== requestGenerationRef.current) {
            return;
          }
          setFetchedSuggestions([]);
          setError(
            err instanceof Error ? err.message : "Autocomplete failed",
          );
        } finally {
          if (
            !controller.signal.aborted &&
            generation === requestGenerationRef.current
          ) {
            setLoading(false);
          }
        }
      }

      void loadFromServer();
    }, AUTOCOMPLETE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [geoAnchor, geoKey, resolution.kind, trimmedQuery]);

  const suggestions =
    resolution.kind === "fetch"
      ? fetchedSuggestions
      : resolution.suggestions;

  return {
    suggestions,
    loading: resolution.kind === "fetch" && loading,
    error: resolution.kind === "fetch" ? error : null,
  };
}
