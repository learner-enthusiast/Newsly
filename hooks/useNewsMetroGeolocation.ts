"use client";

import type { SerializedNewsMetro } from "@/services/news/metroLocation";
import { useCallback, useRef, useState } from "react";

type NearestResponse = {
  metro?: SerializedNewsMetro;
  error?: string;
};

export type NewsMetroGeolocationStatus =
  | "idle"
  | "locating"
  | "resolving"
  | "ready"
  | "error";

type UseNewsMetroGeolocationOptions = {
  enabled?: boolean;
  geolocation?: Pick<PositionOptions, "enableHighAccuracy" | "timeout" | "maximumAge">;
  maxKm?: number;
};

export function useNewsMetroGeolocation(
  options: UseNewsMetroGeolocationOptions = {},
) {
  const { enabled = true, geolocation: geolocationOptions, maxKm } = options;
  const [status, setStatus] = useState<NewsMetroGeolocationStatus>("idle");
  const [metro, setMetro] = useState<SerializedNewsMetro | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lockRef = useRef(false);

  const requestNearestMetro = useCallback(async (): Promise<SerializedNewsMetro | null> => {
    if (!enabled || lockRef.current) {
      return null;
    }
    lockRef.current = true;
    setError(null);

    if (typeof window === "undefined" || !navigator.geolocation) {
      setStatus("error");
      setError("Geolocation is not supported in this browser");
      lockRef.current = false;
      return null;
    }

    setStatus("locating");

    try {
      const coords = await new Promise<GeolocationCoordinates>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (position) => resolve(position.coords),
            (geoError) => {
              reject(
                new Error(
                  geoError.message || "Unable to read device location",
                ),
              );
            },
            {
              enableHighAccuracy: true,
              timeout: 15_000,
              maximumAge: 300_000,
              ...geolocationOptions,
            },
          );
        },
      );

      setStatus("resolving");

      const response = await fetch("/api/news/metros/nearest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: coords.latitude,
          longitude: coords.longitude,
          ...(maxKm != null ? { maxKm } : {}),
        }),
      });

      const payload = (await response.json()) as NearestResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to resolve nearest metro");
      }
      if (!payload.metro) {
        throw new Error("Nearest metro response was empty");
      }

      setMetro(payload.metro);
      setStatus("ready");
      return payload.metro;
    } catch (err) {
      setMetro(null);
      setStatus("error");
      setError(err instanceof Error ? err.message : "Location lookup failed");
      return null;
    } finally {
      lockRef.current = false;
    }
  }, [enabled, geolocationOptions, maxKm]);

  return {
    status,
    metro,
    error,
    isLoading: status === "locating" || status === "resolving",
    requestNearestMetro,
  };
}
