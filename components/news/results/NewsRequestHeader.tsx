"use client";

import { Badge } from "@/components/ui/badge";
import {
  formatDisplayDate,
  formatNewsRequestStatusLabel,
  formatNewsScopeLabel,
} from "@/services/news/newsRequestProgress";
import {
  formatNewsRequestTitle,
  formatRequestTimestamp,
} from "@/services/news/newsRequestDisplay";
import type { SerializedNewsRequest } from "@/services/news/newsRequestTypes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar, CheckCircle2, MapPin, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { RefObject } from "react";

type NewsRequestHeaderProps = {
  request: SerializedNewsRequest;
  storyCountFound: number;
  className?: string;
  headerRef?: RefObject<HTMLElement | null>;
  onRerun?: () => void;
  rerunBusy?: boolean;
};

export function NewsRequestHeader({
  request,
  storyCountFound,
  className,
  headerRef,
  onRerun,
  rerunBusy = false,
}: NewsRequestHeaderProps) {
  const rerunDisabled =
    request.isRerunning || rerunBusy || request.status !== "success";
  const title = formatNewsRequestTitle(request);
  const generatedLabel = formatRequestTimestamp(request.createdAt);
  const completedLabel = formatRequestTimestamp(request.completedAt);
  const languageLabel = request.language?.trim();

  return (
    <header ref={headerRef} className={cn("space-y-4", className)}>
      <Link
        href="/news"
        className="inline-flex text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Back to News
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <h1 className="font-display text-2xl leading-tight font-semibold text-balance sm:text-3xl">
            {title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <Calendar className="size-3" aria-hidden />
              {formatDisplayDate(request.date)}
            </Badge>
            {request.location?.trim() ? (
              <Badge variant="outline" className="gap-1">
                <MapPin className="size-3" aria-hidden />
                {request.location.trim()}
              </Badge>
            ) : null}
            <Badge variant="secondary">{formatNewsScopeLabel(request.scope)}</Badge>
            <Badge variant="outline">
              {storyCountFound}{" "}
              {storyCountFound === 1 ? "story" : "stories"}
            </Badge>
            {languageLabel ? (
              <Badge variant="outline">{languageLabel}</Badge>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end lg:text-right">
          {onRerun && request.status === "success" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={rerunDisabled}
              onClick={onRerun}
              className="w-full sm:w-auto"
            >
              <RefreshCw
                className={cn(
                  "size-4",
                  request.isRerunning && "animate-spin",
                )}
                data-icon="inline-start"
                aria-hidden
              />
              {request.isRerunning
                ? "Refreshing…"
                : rerunBusy
                  ? "Starting…"
                  : "Rerun"}
            </Button>
          ) : null}
          <div className="space-y-1 text-sm">
          {request.status === "success" ? (
            <p className="inline-flex items-center gap-1.5 font-medium text-emerald-800 dark:text-emerald-400">
              <CheckCircle2 className="size-4" aria-hidden />
              {formatNewsRequestStatusLabel(request.status)}
            </p>
          ) : (
            <p className="font-medium">{formatNewsRequestStatusLabel(request.status)}</p>
          )}
          {generatedLabel ? (
            <p className="text-xs text-muted-foreground">
              Generated on {generatedLabel}
            </p>
          ) : null}
          {completedLabel && request.status === "success" ? (
            <p className="text-xs text-muted-foreground">
              Completed on {completedLabel}
            </p>
          ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
