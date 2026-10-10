"use client";

import { Badge } from "@/components/ui/badge";
import {
  formatDisplayDate,
  formatNewsRequestStatusLabel,
  formatNewsScopeLabel,
} from "@/services/news/newsRequestProgress";
import type { SerializedNewsRequest } from "@/services/news/newsRequestTypes";
import { Calendar } from "lucide-react";
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

type NewsRequestSummaryCardProps = {
  request: SerializedNewsRequest;
  compact?: boolean;
};

export function NewsRequestSummaryCard({
  request,
  compact = false,
}: NewsRequestSummaryCardProps) {
  return (
    <Link
      href={`/news/${request.id}`}
      className={
        compact
          ? "block rounded-lg border border-border/60 bg-background/80 p-3 transition-colors hover:bg-muted/40"
          : "block rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-colors hover:bg-muted/40"
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="size-3.5" />
            {formatDisplayDate(request.date)}
          </div>
          <p className="mt-1 truncate text-sm font-medium">
            {request.location ?? formatNewsScopeLabel(request.scope)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="outline">{formatNewsScopeLabel(request.scope)}</Badge>
            {request.categories[0] ? (
              <Badge variant="outline">{request.categories[0]}</Badge>
            ) : null}
          </div>
        </div>
        <Badge variant={statusBadgeVariant(request.status)}>
          {formatNewsRequestStatusLabel(request.status)}
        </Badge>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {request.createdStoryCount} created
        <span className="text-muted-foreground/70">
          {" "}
          · {request.storyCount} requested
        </span>
      </p>
    </Link>
  );
}
