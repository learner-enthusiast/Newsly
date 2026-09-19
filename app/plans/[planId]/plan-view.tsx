"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

type PlanItem = {
  id: string;
  position: number;
  type: string;
  placeId: string | null;
  titleOverride: string | null;
  descriptionOverride: string | null;
  snapshot: unknown;
};

type PlanDay = {
  id: string;
  dayNumber: number;
  date: string | null;
  title: string;
  description: string | null;
  items: PlanItem[];
};

type PlanPayload = {
  id: string;
  slug: string;
  status: string;
  title: string;
  festivalName: string;
  city: string;
  country: string;
  year: number;
  days: PlanDay[];
};

const POLL_INTERVAL_MS = 3000;

function snapshotField(snapshot: unknown, field: string) {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }

  const value = (snapshot as Record<string, unknown>)[field];
  return typeof value === "string" && value.trim() ? value : null;
}

function itemTitle(item: PlanItem) {
  return snapshotField(item.snapshot, "name") ?? item.titleOverride ?? item.type;
}

function itemSubtitle(item: PlanItem) {
  return (
    snapshotField(item.snapshot, "area") ??
    snapshotField(item.snapshot, "address") ??
    item.descriptionOverride
  );
}

function statusVariant(status: string) {
  if (status === "ready") {
    return "accent" as const;
  }

  if (status === "failed") {
    return "destructive" as const;
  }

  return "secondary" as const;
}

export function PlanView({ planId }: { planId: string }) {
  const [plan, setPlan] = useState<PlanPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      try {
        const response = await fetch(`/api/plans/${planId}`, {
          credentials: "include",
        });

        if (!active) {
          return;
        }

        if (response.status === 401) {
          setError("Sign in to view this plan.");
          setLoading(false);
          return;
        }

        if (response.status === 404) {
          setError("Plan not found.");
          setLoading(false);
          return;
        }

        if (!response.ok) {
          setError(`Could not load this plan (${response.status}).`);
          setLoading(false);
          return;
        }

        const payload = (await response.json()) as PlanPayload;

        if (!active) {
          return;
        }

        setPlan(payload);
        setError(null);
        setLoading(false);

        if (payload.status === "processing" || payload.status === "draft") {
          timer = setTimeout(load, POLL_INTERVAL_MS);
        }
      } catch {
        if (!active) {
          return;
        }

        setError("Could not reach the server.");
        setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;

      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [planId]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading plan...</p>;
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!plan) {
    return <p className="text-sm text-muted-foreground">Plan not found.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl text-foreground">{plan.title}</h1>
          <Badge variant={statusVariant(plan.status)}>{plan.status}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {plan.festivalName} · {plan.city}, {plan.country} · {plan.year}
        </p>
        <p className="text-xs text-muted-foreground">/{plan.slug}</p>
      </div>

      {(plan.status === "processing" || plan.status === "draft") && (
        <p className="text-base text-foreground">Creating your plan...</p>
      )}

      {plan.status === "failed" && (
        <p className="text-sm text-destructive">
          We could not finish this plan. Research failed before any days were
          saved — try again with different dates or a different city.
        </p>
      )}

      {plan.status === "ready" && plan.days.length === 0 && (
        <p className="text-sm text-muted-foreground">
          This plan has no days yet.
        </p>
      )}

      {plan.days.length > 0 && (
        <ol className="flex flex-col gap-4">
          {plan.days.map((day) => (
            <li
              key={day.id}
              className="flex flex-col gap-3 rounded-lg bg-card p-4 shadow-paper ring-1 ring-border/15"
            >
              <div className="flex flex-col gap-1">
                <h2 className="font-heading text-base text-foreground">
                  Day {day.dayNumber}
                  {day.date ? ` · ${day.date.slice(0, 10)}` : ""} — {day.title}
                </h2>
                {day.description && (
                  <p className="text-sm text-muted-foreground">
                    {day.description}
                  </p>
                )}
              </div>

              {day.items.length > 0 ? (
                <ol className="flex flex-col gap-2">
                  {day.items.map((item) => (
                    <li key={item.id} className="flex items-baseline gap-2">
                      <span className="text-xs text-muted-foreground">
                        {item.position + 1}.
                      </span>
                      <span className="text-sm text-foreground">
                        {itemTitle(item)}
                      </span>
                      <Badge variant="outline">{item.type}</Badge>
                      {itemSubtitle(item) && (
                        <span className="text-xs text-muted-foreground">
                          {itemSubtitle(item)}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-muted-foreground">No stops yet.</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
