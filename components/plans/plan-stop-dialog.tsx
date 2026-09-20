"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MarkerHighlight } from "@/components/marker-highlight";
import { SketchLoader } from "@/components/sketch-loader";
import { cn } from "@/lib/utils";

export type PlanStopDialogItem = {
  id: string;
  position: number;
  type: string;
  startTime: string | null;
  durationMinutes: number | null;
  notes: string | null;
  snapshot: unknown;
};

type OtherDay = {
  id: string;
  dayNumber: number;
  title: string;
};

type PlanStopDialogProps = {
  item: PlanStopDialogItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mapsUrl: string | null;
  otherDays: OtherDay[];
  busy?: boolean;
  onRemove: () => void;
  onMove: (targetDayId: string) => void;
};

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

function clock(value: string | null) {
  if (!value) {
    return null;
  }

  const match = value.match(/(\d{2}:\d{2})/);
  return match ? match[1] : null;
}

export function PlanStopDialog({
  item,
  open,
  onOpenChange,
  mapsUrl,
  otherDays,
  busy = false,
  onRemove,
  onMove,
}: PlanStopDialogProps) {
  if (!item) {
    return null;
  }

  const name =
    snapshotField(item.snapshot, "name") ?? item.type.replaceAll("_", " ");
  const area = snapshotField(item.snapshot, "area");
  const city = snapshotField(item.snapshot, "city");
  const address = snapshotField(item.snapshot, "address");
  const description =
    snapshotField(item.snapshot, "description") ?? item.notes ?? null;
  const rating = snapshotNumber(item.snapshot, "rating");
  const reviewCount = snapshotNumber(item.snapshot, "reviewCount");
  const thumbnail = snapshotField(item.snapshot, "thumbnailUrl");

  const locationLine = [area, city, address].filter(Boolean).join(" · ");
  const visitTime = clock(item.startTime);
  const duration =
    item.durationMinutes != null ? `~${item.durationMinutes} mins` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className={cn(
          "editorial-border max-w-[min(100%-2rem,36rem)] rounded-2xl bg-card p-0",
          "gap-0 overflow-hidden sm:max-w-[36rem]",
        )}
      >
        {busy ? (
          <div className="p-8">
            <SketchLoader variant="inline" label="Updating stop…" />
          </div>
        ) : (
          <>
            <div className="plan-stop-dialog-body">
              <div className="plan-stop-dialog-copy">
                <DialogHeader className="gap-1.5 text-left">
                  <MarkerHighlight emphasis>
                    <span className="text-[0.6875rem] font-bold tracking-wider uppercase">
                      Stop {String(item.position + 1).padStart(2, "0")}
                    </span>
                  </MarkerHighlight>
                  <DialogTitle className="font-display text-xl leading-snug">
                    {name}
                  </DialogTitle>
                </DialogHeader>

                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs sm:text-sm">
                  {rating != null ? (
                    <span className="font-semibold">
                      ★ {rating.toFixed(1)}
                      {reviewCount != null ? ` (${reviewCount})` : ""}
                    </span>
                  ) : null}
                  {locationLine ? (
                    <span className="line-clamp-2 text-muted-foreground">
                      {locationLine}
                    </span>
                  ) : null}
                </div>

                {description ? (
                  <p className="line-clamp-3 text-xs leading-relaxed text-foreground/90 sm:text-sm">
                    {description}
                  </p>
                ) : null}

                <dl className="plan-stop-meta-grid plan-stop-meta-grid-compact">
                  <div>
                    <dt>Time</dt>
                    <dd>{visitTime ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Duration</dt>
                    <dd>{duration ?? "—"}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt>Address</dt>
                    <dd className="line-clamp-2">{address ?? "—"}</dd>
                  </div>
                </dl>

                {item.notes ? (
                  <div className="editorial-border bg-muted/20 p-2.5">
                    <p className="text-[0.625rem] font-bold tracking-wide uppercase">
                      Why it&apos;s here
                    </p>
                    <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed">
                      {item.notes}
                    </p>
                  </div>
                ) : null}
              </div>

              <aside className="plan-stop-dialog-media">
                {thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbnail}
                    alt=""
                    className="plan-stop-dialog-thumb"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="plan-stop-dialog-thumb plan-stop-dialog-thumb-placeholder">
                    Photo
                  </div>
                )}
              </aside>
            </div>

            <div className="flex flex-col gap-2 border-t border-border/30 bg-background/80 p-3 sm:flex-row sm:flex-wrap sm:items-center">
              {mapsUrl ? (
                <Button
                  variant="brand-accent"
                  render={
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" />
                  }
                >
                  Open in Google Maps →
                </Button>
              ) : null}

              {otherDays.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Move to
                  </span>
                  {otherDays.map((day) => (
                    <Button
                      key={day.id}
                      type="button"
                      variant="sketch-outline"
                      size="sm"
                      onClick={() => onMove(day.id)}
                    >
                      Day {day.dayNumber}
                    </Button>
                  ))}
                </div>
              ) : null}

              <Button
                type="button"
                variant="sketch-outline"
                size="sm"
                className="sm:ml-auto"
                onClick={onRemove}
              >
                Remove
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
