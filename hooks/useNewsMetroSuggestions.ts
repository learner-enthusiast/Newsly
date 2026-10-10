"use client";

import type { SerializedNewsMetro } from "@/services/news/metroLocation";
import { useEffect, useRef, useState } from "react";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

type SearchResponse = {
  metros?: SerializedNewsMetro[];
  error?: string;
};

export function useNewsMetroSuggestions(query: string) {
  const [metros, setMetros] = useState<SerializedNewsMetro[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);

  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setMetros([]);
      setLoading(false);
      setError(null);
      return;
    }

    const generation = ++generationRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const params = new URLSearchParams({ q: trimmed });
          const response = await fetch(
            `/api/news/metros/search?${params.toString()}`,
          );
          const payload = (await response.json()) as SearchResponse;
          if (generation !== generationRef.current) {
            return;
          }
          if (!response.ok) {
            throw new Error(payload.error ?? "Metro search failed");
          }
          setMetros(payload.metros ?? []);
        } catch (err) {
          if (generation !== generationRef.current) {
            return;
          }
          setMetros([]);
          setError(err instanceof Error ? err.message : "Metro search failed");
        } finally {
          if (generation === generationRef.current) {
            setLoading(false);
          }
        }
      })();
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [trimmed]);

  return { metros, loading, error, minQueryLength: MIN_QUERY_LENGTH };
}
