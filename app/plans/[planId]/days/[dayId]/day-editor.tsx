"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlanStopDialog, type PlanStopDialogItem } from "@/components/plans/plan-stop-dialog";
import { SketchLoader } from "@/components/sketch-loader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PlaceCategory } from "@/services/serpService";

type EditorItem = PlanStopDialogItem & {
  placeId: string | null;
};

type EditorPayload = {
  plan: {
    id: string;
    city: string;
    country: string;
    festivalName: string;
    title: string;
    year: number;
  };
  day: {
    id: string;
    planId: string;
    dayNumber: number;
    date: string | null;
    title: string;
    description: string | null;
    startTime: string | null;
    endTime: string | null;
  };
  items: EditorItem[];
  otherDays: { id: string; dayNumber: number; title: string }[];
};

type SearchPlace = {
  externalId: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  reviewCount: number | null;
  description: string | null;
  type: string | null;
  thumbnail: string | null;
};

const ADD_CATEGORIES: { label: string; category: PlaceCategory }[] = [
  { label: "Pandal", category: "pandal" },
  { label: "Food", category: "food" },
  { label: "Cafe", category: "cafe" },
  { label: "Restaurant", category: "restaurant" },
  { label: "Parking", category: "parking" },
];

const PLAN_MAP_ILLUSTRATION: { pic?: string | null } = { pic: null };

function snapshotField(snapshot: unknown, field: string) {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }

  const value = (snapshot as Record<string, unknown>)[field];
  return typeof value === "string" && value.trim() ? value : null;
}

function itemTitle(item: EditorItem) {
  return snapshotField(item.snapshot, "name") ?? item.type;
}

function itemLabel(item: EditorItem) {
  const type = item.type.replaceAll("_", " ").toUpperCase();
  return `${String(item.position + 1).padStart(2, "0")} ${type} — ${itemTitle(item)}`;
}

function mapsSearchUrl(item: EditorItem) {
  const lat = snapshotField(item.snapshot, "latitude");
  const lng = snapshotField(item.snapshot, "longitude");
  const placeId = snapshotField(item.snapshot, "googlePlaceId");
  const name = itemTitle(item);

  if (placeId) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(placeId)}`;
  }

  if (lat && lng) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }

  const address = snapshotField(item.snapshot, "address");

  if (address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }

  return null;
}

function routeMapsUrl(items: EditorItem[]) {
  const coords = items
    .map((item) => {
      const lat = snapshotField(item.snapshot, "latitude");
      const lng = snapshotField(item.snapshot, "longitude");
      return lat && lng ? `${lat},${lng}` : null;
    })
    .filter((value): value is string => Boolean(value));

  if (coords.length < 2) {
    return coords[0]
      ? `https://www.google.com/maps/search/?api=1&query=${coords[0]}`
      : null;
  }

  const params = new URLSearchParams({
    api: "1",
    origin: coords[0],
    destination: coords.at(-1)!,
    travelmode: "walking",
  });

  const waypoints = coords.slice(1, -1).join("|");

  if (waypoints) {
    params.set("waypoints", waypoints);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function DayEditor({ planId, dayId }: { planId: string; dayId: string }) {
  const [payload, setPayload] = useState<EditorPayload | null>(null);
  const [items, setItems] = useState<EditorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogItem, setDialogItem] = useState<EditorItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [orderDirty, setOrderDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCategory, setSearchCategory] = useState<PlaceCategory>("pandal");
  const [searchResults, setSearchResults] = useState<SearchPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/plans/${planId}/days/${dayId}`, {
        credentials: "include",
      });

      if (!response.ok) {
        setError(
          response.status === 404
            ? "Day not found."
            : `Could not load day (${response.status}).`,
        );
        setLoading(false);
        return;
      }

      const data = (await response.json()) as EditorPayload;
      setPayload(data);
      setItems(data.items);
      setSelectedId(data.items[0]?.id ?? null);
      setOrderDirty(false);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [dayId, planId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  const routeUrl = useMemo(() => routeMapsUrl(items), [items]);

  function reorderLocal(nextIds: string[]) {
    const byId = new Map(items.map((item) => [item.id, item]));
    const reordered = nextIds
      .map((id) => byId.get(id))
      .filter((item): item is EditorItem => Boolean(item))
      .map((item, position) => ({ ...item, position }));

    setItems(reordered);
    setOrderDirty(true);
  }

  function onDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) {
      return;
    }

    const ids = items.map((item) => item.id);
    const from = ids.indexOf(draggingId);
    const to = ids.indexOf(targetId);

    if (from < 0 || to < 0) {
      return;
    }

    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, draggingId);
    reorderLocal(next);
    setDraggingId(null);
  }

  async function saveOrder() {
    setSaving(true);

    try {
      const response = await fetch(`/api/plans/${planId}/days/${dayId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemOrder: items.map((item) => item.id) }),
      });

      if (!response.ok) {
        setError("Could not save changes.");
        return;
      }

      const body = (await response.json()) as { items: EditorItem[] };
      setItems(body.items);
      setOrderDirty(false);
    } catch {
      setError("Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function runSearch(category?: PlaceCategory) {
    const cat = category ?? searchCategory;
    setSearching(true);

    try {
      const params = new URLSearchParams({ category: cat });

      if (searchQuery.trim()) {
        params.set("q", searchQuery.trim());
      }

      const response = await fetch(
        `/api/plans/${planId}/days/${dayId}/places/search?${params.toString()}`,
        { credentials: "include" },
      );

      if (!response.ok) {
        return;
      }

      const body = (await response.json()) as { places: SearchPlace[] };
      setSearchResults(body.places ?? []);
    } finally {
      setSearching(false);
    }
  }

  async function addPlace(place: SearchPlace, category: PlaceCategory) {
    setAddingId(place.externalId);

    try {
      const response = await fetch(
        `/api/plans/${planId}/days/${dayId}/items`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...place, category }),
        },
      );

      if (!response.ok) {
        setError("Could not add stop.");
        return;
      }

      const body = (await response.json()) as { item: EditorItem };
      setItems((prior) => [...prior, body.item]);
      setSelectedId(body.item.id);
      setSearchResults([]);
    } catch {
      setError("Could not add stop.");
    } finally {
      setAddingId(null);
    }
  }

  async function removeItem(itemId: string) {
    setDialogBusy(true);

    try {
      const response = await fetch(
        `/api/plans/${planId}/days/${dayId}/items/${itemId}`,
        { method: "DELETE", credentials: "include" },
      );

      if (!response.ok) {
        setError("Could not remove stop.");
        return;
      }

      setItems((prior) =>
        prior
          .filter((item) => item.id !== itemId)
          .map((item, position) => ({ ...item, position })),
      );
      setDialogOpen(false);
      setDialogItem(null);

      if (selectedId === itemId) {
        setSelectedId(null);
      }
    } finally {
      setDialogBusy(false);
    }
  }

  async function moveItem(itemId: string, targetDayId: string) {
    setDialogBusy(true);

    try {
      const response = await fetch(
        `/api/plans/${planId}/days/${dayId}/items/${itemId}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetDayId }),
        },
      );

      if (!response.ok) {
        setError("Could not move stop.");
        return;
      }

      setItems((prior) =>
        prior
          .filter((item) => item.id !== itemId)
          .map((item, position) => ({ ...item, position })),
      );
      setDialogOpen(false);
      setDialogItem(null);
    } finally {
      setDialogBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="py-16">
        <SketchLoader variant="page" label="Loading your day…" />
      </div>
    );
  }

  if (error && !payload) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!payload) {
    return <p className="text-sm text-muted-foreground">Day not found.</p>;
  }

  const dayHeading = `DAY ${String(payload.day.dayNumber).padStart(2, "0")} — ${payload.day.title.toUpperCase()}`;

  return (
    <div className="flex flex-col gap-8 pb-16">
      <div className="flex flex-col gap-2 border-b border-border/30 pb-6">
        <Link
          href={`/plans/${planId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to plan
        </Link>
        <h1 className="plan-day-heading">{dayHeading}</h1>
        <p className="font-brand text-base text-foreground/90">
          Drag things around until the day feels right.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="day-editor-grid">
        <ol className="plan-stop-list">
          {items.map((item) => {
            const selected = item.id === selectedId;
            const dragging = item.id === draggingId;

            return (
              <li
                key={item.id}
                className="plan-stop-item w-full"
                draggable
                onDragStart={() => setDraggingId(item.id)}
                onDragEnd={() => setDraggingId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => onDrop(item.id)}
              >
                <button
                  type="button"
                  className={cn(
                    "plan-day-list-card editorial-border w-full text-left",
                    selected && "plan-day-list-card-active",
                    dragging && "opacity-60",
                  )}
                  onClick={() => setSelectedId(item.id)}
                  onDoubleClick={() => {
                    setDialogItem(item);
                    setDialogOpen(true);
                  }}
                >
                  <span className="plan-day-drag-handle" aria-hidden>
                    ⋮⋮
                  </span>
                  <span className="text-sm font-medium">{itemLabel(item)}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="plan-day-detail editorial-border">
          {selectedItem ? (
            <>
              <h2 className="font-display text-xl">{itemTitle(selectedItem)}</h2>
              <p className="text-sm text-muted-foreground">
                {snapshotField(selectedItem.snapshot, "address") ??
                  snapshotField(selectedItem.snapshot, "area") ??
                  payload.plan.city}
              </p>
              {selectedItem.notes ? (
                <p className="text-sm leading-relaxed">{selectedItem.notes}</p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  type="button"
                  variant="sketch-outline"
                  size="sm"
                  onClick={() => {
                    setDialogItem(selectedItem);
                    setDialogOpen(true);
                  }}
                >
                  Explore
                </Button>
                {mapsSearchUrl(selectedItem) ? (
                  <Button
                    type="button"
                    variant="sketch-outline"
                    size="sm"
                    render={
                      <a
                        href={mapsSearchUrl(selectedItem)!}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    }
                  >
                    Open Maps
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="sketch-outline"
                  size="sm"
                  onClick={() => void removeItem(selectedItem.id)}
                >
                  Remove
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a stop to preview details. Double-click for the full card.
            </p>
          )}
        </div>

        <aside className="plan-map-panel editorial-border">
          {PLAN_MAP_ILLUSTRATION.pic ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={PLAN_MAP_ILLUSTRATION.pic}
              alt=""
              className="plan-map-art plan-illustration-image"
            />
          ) : (
            <div className="plan-illustration-placeholder plan-map-art">
              Route map illustration
            </div>
          )}
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
        </aside>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="plan-section-kicker">+ Add something</h2>
        <div className="flex flex-wrap gap-2">
          {ADD_CATEGORIES.map((entry) => (
            <Button
              key={entry.category}
              type="button"
              variant={
                searchCategory === entry.category ? "sketch-chip-active" : "sketch-chip"
              }
              onClick={() => {
                setSearchCategory(entry.category);
                void runSearch(entry.category);
              }}
            >
              {entry.label}
            </Button>
          ))}
        </div>
        <form
          className="intake-destination-search py-0 pl-0"
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch();
          }}
        >
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search maps in this city…"
            className="intake-sketch-field intake-destination-search-input"
          />
          <Button type="submit" variant="sketch-outline" disabled={searching}>
            {searching ? "Searching…" : "Search"}
          </Button>
        </form>
        {searching ? (
          <SketchLoader variant="inline" label="Searching Google Maps…" />
        ) : null}
        {searchResults.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {searchResults.map((place) => (
              <li key={place.externalId}>
                <button
                  type="button"
                  className="plan-day-search-result editorial-border w-full p-3 text-left"
                  disabled={addingId === place.externalId}
                  onClick={() => void addPlace(place, searchCategory)}
                >
                  <p className="font-medium">{place.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[place.address, place.rating != null ? `${place.rating}★` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-3 border-t border-border/30 pt-6">
        <Button
          type="button"
          variant="sketch"
          disabled={!orderDirty || saving}
          onClick={() => void saveOrder()}
        >
          {saving ? "Saving…" : "Save changes"}
        </Button>
        {routeUrl ? (
          <Button
            type="button"
            variant="sketch-outline"
            render={
              <a href={routeUrl} target="_blank" rel="noopener noreferrer" />
            }
          >
            Open Google Maps
          </Button>
        ) : null}
      </div>

      <PlanStopDialog
        item={dialogItem}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mapsUrl={dialogItem ? mapsSearchUrl(dialogItem) : null}
        otherDays={payload.otherDays}
        busy={dialogBusy}
        onRemove={() => dialogItem && void removeItem(dialogItem.id)}
        onMove={(targetDayId) =>
          dialogItem && void moveItem(dialogItem.id, targetDayId)
        }
      />
    </div>
  );
}
