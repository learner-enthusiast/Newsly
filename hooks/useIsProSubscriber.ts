"use client";

import {
  planFromMeResponse,
  type UserPlan,
} from "@/services/billing/userPlanAccess";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";

type UseIsProSubscriberOptions = {
  /** Skip fetching (e.g. feature flag). Defaults to true. */
  enabled?: boolean;
  /** Hydrate from SSR to avoid a flash before the first `/api/me` response. */
  initialPlan?: UserPlan | null;
};

type MePayload = {
  plan?: UserPlan;
  subscription?: { currentPeriodEnd?: string | null } | null;
};

type PlanSnapshot = {
  userId: string;
  plan: UserPlan | null;
};

async function fetchPlanFromMe(): Promise<UserPlan | null> {
  const response = await fetch("/api/me", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      response.status === 401 ? "Unauthorized" : "Failed to load account",
    );
  }
  const payload = (await response.json()) as MePayload;
  return planFromMeResponse(payload);
}

export function useIsProSubscriber(options: UseIsProSubscriberOptions = {}) {
  const { enabled = true, initialPlan } = options;
  const { isLoaded, isSignedIn, userId } = useAuth();

  const [snapshot, setSnapshot] = useState<PlanSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const shouldSync = enabled && isLoaded && isSignedIn && userId != null;

  useEffect(() => {
    if (!shouldSync) {
      return;
    }

    const activeUserId = userId;
    let cancelled = false;

    void fetchPlanFromMe()
      .then((plan) => {
        if (cancelled) {
          return;
        }
        setSnapshot({ userId: activeUserId, plan });
        setError(null);
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load account");
      });

    return () => {
      cancelled = true;
    };
  }, [shouldSync, userId]);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setSnapshot(null);
      setError(null);
      setRefreshing(false);
      return;
    }

    if (!isSignedIn || !userId) {
      setSnapshot(null);
      setError(null);
      setRefreshing(false);
      return;
    }

    setRefreshing(true);
    setError(null);
    try {
      const plan = await fetchPlanFromMe();
      setSnapshot({ userId, plan });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load account");
    } finally {
      setRefreshing(false);
    }
  }, [enabled, isSignedIn, userId]);

  const snapshotMatchesUser =
    shouldSync && snapshot?.userId === userId ? snapshot.plan : null;

  const plan =
    snapshotMatchesUser ??
    (shouldSync && initialPlan !== undefined ? initialPlan : null);

  const awaitingFirstFetch =
    shouldSync && snapshot?.userId !== userId && initialPlan === undefined;

  const isLoading = !isLoaded || awaitingFirstFetch || refreshing;

  const isPro = isSignedIn === true && plan === "PRO";

  return {
    isPro,
    plan: isSignedIn ? plan : null,
    isLoading,
    isSignedIn: isSignedIn === true,
    error,
    refresh,
  };
}
