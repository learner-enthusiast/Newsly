"use client";

import {
  isProSubscriberPlan,
  planFromMeResponse,
  type UserPlan,
} from "@/services/billing/userPlan";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";

type UseIsProSubscriberOptions = {
  /** Skip fetching (e.g. feature flag). Defaults to true. */
  enabled?: boolean;
  /** Hydrate from SSR to avoid a flash before the first `/api/me` response. */
  initialPlan?: UserPlan | null;
};

export function useIsProSubscriber(options: UseIsProSubscriberOptions = {}) {
  const { enabled = true, initialPlan } = options;
  const { isLoaded, isSignedIn } = useAuth();

  const [plan, setPlan] = useState<UserPlan | null>(() =>
    initialPlan !== undefined ? initialPlan : null,
  );
  const [isLoading, setIsLoading] = useState(
    () => enabled && initialPlan === undefined,
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setPlan(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    if (!isSignedIn) {
      setPlan(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/me", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(
          response.status === 401 ? "Unauthorized" : "Failed to load account",
        );
      }
      const payload = (await response.json()) as { plan?: UserPlan };
      setPlan(planFromMeResponse(payload));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load account");
    } finally {
      setIsLoading(false);
    }
  }, [enabled, isSignedIn]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }
    void refresh();
  }, [isLoaded, refresh]);

  const isPro = isSignedIn && isProSubscriberPlan(plan);

  return {
    isPro,
    plan: isSignedIn ? plan : null,
    isLoading: !isLoaded || isLoading,
    isSignedIn: isSignedIn === true,
    error,
    refresh,
  };
}
