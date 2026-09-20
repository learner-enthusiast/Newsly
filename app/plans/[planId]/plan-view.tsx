"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MarkerHighlight } from "@/components/marker-highlight";
import { SketchLoader } from "@/components/sketch-loader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PlanItem = {
  id: string;
  position: number;
  type: string;
  placeId: string | null;
  titleOverride: string | null;
  descriptionOverride: string | null;
  startTime: string | null;
  durationMinutes: number | null;
  notes: string | null;
  snapshot: unknown;
};

type PlanDay = {
  id: string;
  dayNumber: number;
  date: string | null;
  title: string;
  description: string | null;
  startTime: string | null;
  endTime: string | null;
  items: PlanItem[];
};

type WeatherDay = {
  date: string | null;
  condition: string | null;
  temperatureMin: number | null;
  temperatureMax: number | null;
  rainProbability: number | null;
  forecastAvailable?: boolean;
};

type PlanPayload = {
  id: string;
  slug: string;
  status: string;
  title: string;
  description: string | null;
  festivalName: string;
  city: string;
  country: string;
  year: number;
  weather: { days?: WeatherDay[]; location?: string } | null;
  days: PlanDay[];
};

const POLL_INTERVAL_MS = 3000;

const PLAN_HERO_ILLUSTRATION: { pic?: string | null } = { pic: null };
const PLAN_MAP_ILLUSTRATION: { pic?: string | null } = { pic: null };

function snapshotField(snapshot: unknown, field: string) {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }

  const value = (snapshot as Record<string, unknown>)[field];

  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function snapshotNumber(snapshot: unknown, field: string) {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }

  const value = (snapshot as Record<string, unknown>)[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function itemTitle(item: PlanItem) {
  return snapshotField(item.snapshot, "name") ?? item.titleOverride ?? item.type;
}

function itemArea(item: PlanItem) {
  return (
    snapshotField(item.snapshot, "area") ??
    snapshotField(item.snapshot, "city") ??
    item.descriptionOverride
  );
}

function clock(value: string | null) {
  if (!value) {
    return null;
  }

  const match = value.match(/(\d{2}:\d{2})/);
  return match ? match[1] : null;
}

function isoDateOnly(value: string | null) {
  return value ? value.slice(0, 10) : null;
}

function formatDisplayDate(iso: string | null) {
  if (!iso) {
    return null;
  }

  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return iso.slice(0, 10);
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function planMetaSummary(plan: PlanPayload) {
  const dayCount = plan.days.length;
  const stopCount = plan.days.reduce((total, day) => total + day.items.length, 0);
  const types = [
    ...new Set(
      plan.days.flatMap((day) => day.items.map((item) => item.type.toLowerCase())),
    ),
  ];

  const typeLabel =
    types.length > 0
      ? types
          .map((type) => (type === "restaurant" ? "food" : type))
          .slice(0, 4)
          .join(" + ")
      : "stops";

  return `${dayCount} day${dayCount === 1 ? "" : "s"} • ${stopCount} stops • ${typeLabel}`;
}

function heroBlurb(description: string | null) {
  if (!description) {
    return null;
  }

  const first = description.split(/\n{2,}/)[0]?.trim();
  return first ?? description;
}

function weatherCardLabel(dayNumber: number) {
  return `DAY ${dayNumber}`;
}

function weatherCardCopy(day: WeatherDay) {
  if (day.forecastAvailable === false) {
    return "Forecast not available yet";
  }

  const temp =
    day.temperatureMax != null
      ? `${day.temperatureMax}°C`
      : day.temperatureMin != null
        ? `${day.temperatureMin}°C`
        : null;

  const rain =
    day.rainProbability != null ? `${day.rainProbability}% rain` : null;

  return [temp, rain, day.condition].filter(Boolean).join(", ") || "—";
}

function stopTypeLabel(type: string) {
  return type.replaceAll("_", " ").toUpperCase();
}

function stopPositionLabel(position: number) {
  return String(position + 1).padStart(2, "0");
}

function mapsSearchUrl(item: PlanItem) {
  const lat = snapshotNumber(item.snapshot, "latitude");
  const lng = snapshotNumber(item.snapshot, "longitude");
  const placeId = snapshotField(item.snapshot, "googlePlaceId");
  const name = itemTitle(item);

  if (placeId) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(placeId)}`;
  }

  if (lat != null && lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }

  const address = snapshotField(item.snapshot, "address");

  if (address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }

  return null;
}

function routeMapsUrl(plan: PlanPayload, day: PlanDay) {
  const coords = day.items
    .map((item) => {
      const lat = snapshotNumber(item.snapshot, "latitude");
      const lng = snapshotNumber(item.snapshot, "longitude");

      if (lat == null || lng == null) {
        return null;
      }

      return `${lat},${lng}`;
    })
    .filter((value): value is string => Boolean(value));

  if (coords.length < 2) {
    return coords[0]
      ? `https://www.google.com/maps/search/?api=1&query=${coords[0]}`
      : null;
  }

  const origin = coords[0];
  const destination = coords.at(-1)!;
  const waypoints = coords.slice(1, -1).join("|");

  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "walking",
  });

  if (waypoints) {
    params.set("waypoints", waypoints);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function dayTabLabel(day: PlanDay) {
  const areaHint = day.title.split(" at ").pop() ?? day.title;
  const shortArea =
    areaHint.length > 28 ? `${areaHint.slice(0, 25).trim()}…` : areaHint;

  return `DAY ${String(day.dayNumber).padStart(2, "0")} — ${shortArea.toUpperCase()}`;
}

function IllustrationSlot({
  pic,
  alt,
  className,
  placeholder,
}: {
  pic?: string | null;
  alt: string;
  className?: string;
  placeholder: string;
}) {
  if (pic) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- user-provided plan art
      <img src={pic} alt={alt} className={cn("plan-illustration-image", className)} />
    );
  }

  return (
    <div className={cn("plan-illustration-placeholder", className)} aria-hidden>
      {placeholder}
    </div>
  );
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

  const previewDay = plan?.days[0] ?? null;

  const routeUrl = useMemo(
    () => (plan && previewDay ? routeMapsUrl(plan, previewDay) : null),
    [previewDay, plan],
  );

  if (loading) {
    return (
      <div className="py-16">
        <SketchLoader variant="page" label="Loading your route…" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!plan) {
    return <p className="text-sm text-muted-foreground">Plan not found.</p>;
  }

  const blurb = heroBlurb(plan.description);

  return (
    <div className="flex flex-col gap-10 pb-16 md:gap-12">
      <section className="plan-hero-grid">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-display text-4xl md:text-5xl">
              {plan.festivalName} {plan.year}
            </h1>
            <p className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {plan.city}
            </p>
            <p className="plan-meta-line">{planMetaSummary(plan)}</p>
          </div>

          {blurb ? (
            <p className="max-w-2xl text-sm leading-relaxed text-foreground/90 md:text-base">
              {blurb}
            </p>
          ) : null}

          {(plan.status === "processing" || plan.status === "draft") && (
            <p className="font-brand text-base text-foreground">
              Creating your plan…
            </p>
          )}

          {plan.status === "failed" && (
            <p className="text-sm text-destructive">
              We could not finish this plan. Try again with different dates or a
              different city.
            </p>
          )}
        </div>

        <IllustrationSlot
          pic={PLAN_HERO_ILLUSTRATION.pic}
          alt=""
          className="plan-hero-art"
          placeholder="Hero illustration"
        />
      </section>

      {plan.weather?.days && plan.weather.days.length > 0 ? (
        <section className="plan-weather-panel editorial-border">
          <h2 className="plan-section-kicker">The weather</h2>
          <ul className="plan-weather-grid">
            {plan.weather.days.map((day, index) => (
              <li key={day.date ?? index} className="plan-weather-card">
                <p className="plan-weather-day">{weatherCardLabel(index + 1)}</p>
                <p className="plan-weather-date">
                  {formatDisplayDate(day.date) ?? "Date TBD"}
                </p>
                <p className="plan-weather-copy">{weatherCardCopy(day)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {plan.description && (
        <section className="plan-about editorial-border">
          <h2 className="plan-section-kicker">About this plan</h2>
          <div className="flex flex-col gap-3 text-sm leading-relaxed text-foreground/90 md:text-base">
            {plan.description.split(/\n{2,}/).map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </section>
      )}

      {plan.days.length > 0 && previewDay ? (
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-wrap gap-2">
              {plan.days.map((day, index) => (
                <Link
                  key={day.id}
                  href={`/plans/${plan.id}/days/${day.id}`}
                  className={cn(
                    "plan-day-tab",
                    index === 0 && "plan-day-tab-active",
                  )}
                >
                  {index === 0 ? (
                    <MarkerHighlight emphasis>{dayTabLabel(day)}</MarkerHighlight>
                  ) : (
                    dayTabLabel(day)
                  )}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="plan-day-heading">
              DAY {String(previewDay.dayNumber).padStart(2, "0")} —{" "}
              {previewDay.title.replace(/^.*?\bat\b\s/i, "").toUpperCase() ||
                previewDay.title.toUpperCase()}
            </h2>
            {previewDay.description ? (
              <p className="font-brand max-w-xl text-base text-foreground/90">
                {previewDay.description}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {[
                previewDay.date
                  ? formatDisplayDate(isoDateOnly(previewDay.date))
                  : null,
                clock(previewDay.startTime) && clock(previewDay.endTime)
                  ? `${clock(previewDay.startTime)}–${clock(previewDay.endTime)}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="pt-1">
              <Button variant="sketch" render={<Link href={`/plans/${plan.id}/days/${previewDay.id}`} />}>
                Edit this day →
              </Button>
            </div>
          </div>

          <div className="plan-itinerary-grid">
            <ol className="plan-stop-list">
              {previewDay.items.map((item, index) => {
                const mapsUrl = mapsSearchUrl(item);
                const rating = snapshotNumber(item.snapshot, "rating");

                return (
                  <li key={item.id} className="plan-stop-item">
                    <article className="plan-stop-card editorial-border">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="plan-stop-index">
                          {stopPositionLabel(item.position)}
                        </span>
                        <span className="plan-stop-type">
                          {stopTypeLabel(item.type)}
                        </span>
                        <span className="text-muted-foreground">—</span>
                        <h3 className="plan-stop-title">{itemTitle(item)}</h3>
                        {rating != null ? (
                          <span className="plan-stop-rating">{rating.toFixed(1)} ★</span>
                        ) : null}
                      </div>

                      {itemArea(item) ? (
                        <p className="text-sm text-muted-foreground">{itemArea(item)}</p>
                      ) : null}

                      {item.notes ? (
                        <p className="text-sm leading-relaxed text-foreground/85">
                          {item.notes}
                        </p>
                      ) : null}

                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button type="button" variant="sketch-outline" size="sm">
                          Explore
                        </Button>
                        {mapsUrl ? (
                          <Button
                            type="button"
                            variant="sketch-outline"
                            size="sm"
                            render={
                              <a
                                href={mapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              />
                            }
                          >
                            Open Maps
                          </Button>
                        ) : null}
                      </div>
                    </article>

                    {index < previewDay.items.length - 1 ? (
                      <span className="plan-stop-arrow" aria-hidden>
                        ↓
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>

            <aside className="plan-map-panel editorial-border">
              <IllustrationSlot
                pic={PLAN_MAP_ILLUSTRATION.pic}
                alt=""
                className="plan-map-art"
                placeholder="Route map illustration"
              />
              {routeUrl ? (
                <Link
                  href={routeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="plan-route-link font-brand"
                >
                  Open full route in Google Maps →
                </Link>
              ) : null}
              <p className="font-brand text-sm text-muted-foreground">
                Pins follow stop order for the day.
              </p>
            </aside>
          </div>
        </section>
      ) : null}

      {plan.status === "ready" && plan.days.length > 0 ? (
        <section className="plan-actions-panel">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="plan-section-kicker">Make it yours</h2>
              <p className="text-sm text-muted-foreground">
                Open a day to reorder stops, add places from Maps, or remove
                anything that doesn&apos;t fit.
              </p>
            </div>
            <p className="font-brand text-base text-foreground/90">
              Your route. Change anything.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {plan.days.map((day) => (
              <Button
                key={day.id}
                variant="sketch-outline"
                render={<Link href={`/plans/${plan.id}/days/${day.id}`} />}
              >
                Edit day {day.dayNumber}
              </Button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
