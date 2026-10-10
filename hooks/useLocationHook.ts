"use client";

import type { ResolvedUserLocation } from "@/services/location/userLocationTypes";
import { useCallback, useRef, useState } from "react";

export type LocationHookStatus =
  | "idle"
  | "locating"
  | "resolving"
  | "ready"
  | "error";

type UseLocationHookOptions = {
  /** When false, `requestLocation` is a no-op. Default true. */
  enabled?: boolean;
  geolocation?: Pick<PositionOptions, "enableHighAccuracy" | "timeout" | "maximumAge">;
};

type LocationReverseResponse = {
  location?: ResolvedUserLocation;
  error?: string;
};

export function useLocationHook(options: UseLocationHookOptions = {}) {
  const { enabled = true, geolocation: geolocationOptions } = options;

  const [status, setStatus] = useState<LocationHookStatus>("idle");
  const [location, setLocation] = useState<ResolvedUserLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestLockRef = useRef(false);

  const requestLocation = useCallback(async (): Promise<ResolvedUserLocation | null> => {
    if (!enabled || requestLockRef.current) {
      return null;
    }
    requestLockRef.current = true;
    setError(null);

    if (typeof window === "undefined" || !navigator.geolocation) {
      setStatus("error");
      setError("Geolocation is not supported in this browser");
      requestLockRef.current = false;
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

      const response = await fetch("/api/location/reverse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: coords.latitude,
          longitude: coords.longitude,
        }),
      });

      const payload = (await response.json()) as LocationReverseResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to resolve nearest city");
      }
      if (!payload.location) {
        throw new Error("Location response was empty");
      }

      setLocation(payload.location);
      setStatus("ready");
      return payload.location;
    } catch (err) {
      setLocation(null);
      setStatus("error");
      setError(err instanceof Error ? err.message : "Location lookup failed");
      return null;
    } finally {
      requestLockRef.current = false;
    }
  }, [enabled, geolocationOptions]);

  const isLoading = status === "locating" || status === "resolving";

  return {
    location,
    status,
    error,
    isLoading,
    requestLocation,
  };
}

export type { ResolvedUserLocation, LocationAutocompleteSuggestion } from "@/services/location/userLocationTypes";
