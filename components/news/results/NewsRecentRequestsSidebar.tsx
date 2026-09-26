"use client";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatDisplayDate,
  formatNewsRequestStatusLabel,
} from "@/services/news/newsRequestProgress";
import {
  formatNewsRequestTitle,
} from "@/services/news/newsRequestDisplay";
import type { SerializedNewsRequest } from "@/services/news/newsRequestTypes";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import Link from "next/link";

function statusDotClass(status: SerializedNewsRequest["status"]): string {
  switch (status) {
    case "success":
      return "bg-emerald-600";
    case "failed":
      return "bg-destructive";
    default:
      return "bg-accent animate-pulse";
  }
}

type NewsRecentRequestsSidebarProps = {
  recentRequests: SerializedNewsRequest[];
  recentLoading: boolean;
  activeRequestId?: string;
  className?: string;
};

export function NewsRecentRequestsSidebar({
  recentRequests,
  recentLoading,
  activeRequestId,
  className,
}: NewsRecentRequestsSidebarProps) {
  return (
    <aside
      className={cn(
        "flex w-full shrink-0 flex-col gap-4 lg:w-[260px]",
        className,
      )}
      aria-label="Recent news requests"
    >
      <Link
        href="/news"
        className={cn(buttonVariants({ variant: "brand-accent", size: "sm" }), "w-full justify-center")}
      >
        <Plus data-icon="inline-start" />
        New News Request
      </Link>

      <div>
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Recent Requests
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {recentLoading ? (
            <>
              <Skeleton className="h-[72px] w-full rounded-xl" />
              <Skeleton className="h-[72px] w-full rounded-xl" />
            </>
          ) : recentRequests.length === 0 ? (
            <li className="rounded-xl border border-dashed border-border/70 bg-card/50 px-3 py-4 text-sm text-muted-foreground">
              Your generated briefings will appear here.
            </li>
          ) : (
            recentRequests.map((request) => {
              const active = request.id === activeRequestId;
              const title = formatNewsRequestTitle(request);
              const locationLabel = request.location?.trim() ?? "—";
              return (
                <li key={request.id}>
                  <Link
                    href={`/news/${request.id}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-xl border bg-card/80 px-3 py-3 shadow-paper transition-colors hover:bg-muted/35",
                      active
                        ? "border-accent/60 ring-2 ring-accent/25"
                        : "border-border/60",
                    )}
                  >
                    <p className="line-clamp-2 text-sm font-medium leading-snug">
                      {title}
                    </p>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {formatDisplayDate(request.date)} · {locationLabel} ·{" "}
                      {request.storyCount}{" "}
                      {request.storyCount === 1 ? "story" : "stories"}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={cn("size-2 shrink-0 rounded-full", statusDotClass(request.status))}
                        aria-hidden
                      />
                      <span className="text-xs text-muted-foreground">
                        {formatNewsRequestStatusLabel(request.status)}
                      </span>
                      {request.status === "pending" ? (
                        <Badge variant="outline" className="ml-auto">
                          Running
                        </Badge>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </aside>
  );
}
