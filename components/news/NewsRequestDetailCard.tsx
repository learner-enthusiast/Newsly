"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  formatDisplayDate,
  formatNewsRequestStatusLabel,
  formatNewsScopeLabel,
  sanitizeNewsRequestError,
} from "@/services/news/newsRequestProgress";
import type { SerializedNewsRequest } from "@/services/news/newsRequestTypes";
import {
  Calendar,
  ChevronRight,
  Clock,
  Languages,
  MapPin,
  Newspaper,
} from "lucide-react";
import Link from "next/link";

function statusBadgeVariant(
  status: SerializedNewsRequest["status"],
): "secondary" | "destructive" | "outline" {
  if (status === "success") {
    return "secondary";
  }
  if (status === "failed") {
    return "destructive";
  }
  return "outline";
}

function formatDateTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return parsed.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type NewsRequestDetailCardProps = {
  request: SerializedNewsRequest;
};

export function NewsRequestDetailCard({ request }: NewsRequestDetailCardProps) {
  const created = request.createdStoryCount;
  const requested = request.storyCount;

  return (
    <Link
      href={`/news/${request.id}`}
      data-news-request-card
      className={cn(
        "group block rounded-2xl border border-border/70 bg-card p-5 shadow-sm",
        "transition-[transform,box-shadow,border-color] duration-300 ease-out",
        "hover:-translate-y-0.5 hover:border-border hover:shadow-md",
        "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold tracking-tight">
            {request.location ?? formatNewsScopeLabel(request.scope)}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3.5" />
              {formatDisplayDate(request.date)}
            </span>
            {request.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" />
                {formatNewsScopeLabel(request.scope)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={statusBadgeVariant(request.status)}>
            {formatNewsRequestStatusLabel(request.status)}
          </Badge>
          <ChevronRight className="size-4 text-muted-foreground transition-transform duration-300 group-hover:translate-x-0.5" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-muted/50 px-3 py-2.5">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Requested
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
            <Newspaper className="size-3.5 text-muted-foreground" />
            {requested} {requested === 1 ? "story" : "stories"}
          </p>
        </div>
        <div className="rounded-xl bg-muted/50 px-3 py-2.5">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Created
          </p>
          <p className="mt-0.5 text-sm font-semibold">
            {created} {created === 1 ? "story" : "stories"}
          </p>
        </div>
        <div className="col-span-2 rounded-xl bg-muted/50 px-3 py-2.5 sm:col-span-1">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Language
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm font-semibold">
            <Languages className="size-3.5 shrink-0 text-muted-foreground" />
            {request.language ?? "English"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-muted/50 px-3 py-2.5">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Created at
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium">
            <Clock className="size-3.5 shrink-0 text-muted-foreground" />
            {formatDateTime(request.createdAt)}
          </p>
        </div>
        <div className="rounded-xl bg-muted/50 px-3 py-2.5">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Completed at
          </p>
          <p className="mt-0.5 text-sm font-medium">
            {request.completedAt ? formatDateTime(request.completedAt) : "Still running"}
          </p>
        </div>
      </div>

      {request.searchQueries ? (
        <div className="mt-4 space-y-2.5">
          <div>
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              News query
            </p>
            <p className="mt-1 text-sm leading-relaxed">
              {request.searchQueries.news}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Search query
            </p>
            <p className="mt-1 text-sm leading-relaxed">
              {request.searchQueries.search}
            </p>
          </div>
          {request.searchQueries.extraPairs.map((pair, index) => (
            <div key={`${pair.news}-${index}`}>
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Extra search pair {index + 1}
              </p>
              <p className="mt-1 text-sm leading-relaxed">{pair.news}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                {pair.search}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {request.customQuery ? (
        <p className="mt-2 line-clamp-2 text-sm">
          <span className="text-muted-foreground">Focus: </span>
          {request.customQuery}
        </p>
      ) : null}

      {request.categories.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {request.categories.map((category) => (
            <Badge key={category} variant="outline">
              {category}
            </Badge>
          ))}
        </div>
      ) : (
        <Badge variant="outline" className="mt-3">
          All topics
        </Badge>
      )}

      {request.status === "failed" && request.error ? (
        <p className="mt-3 text-xs text-destructive">
          {sanitizeNewsRequestError(request.error)}
        </p>
      ) : null}
    </Link>
  );
}
