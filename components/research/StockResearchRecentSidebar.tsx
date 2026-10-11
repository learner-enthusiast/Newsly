"use client";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  formatStockResearchStatusLabel,
  formatStockResearchTitle,
  isStockResearchInProgress,
  type SerializedStockResearch,
} from "@/services/stockResearch/stockResearchTypes";
import { Plus } from "lucide-react";
import Link from "next/link";

export function stockResearchStatusDotClass(
  status: SerializedStockResearch["status"],
): string {
  switch (status) {
    case "COMPLETED":
      return "bg-emerald-600";
    case "FAILED":
      return "bg-destructive";
    default:
      return "bg-accent animate-pulse";
  }
}

export function formatStockResearchDateTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return parsed.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type StockResearchRecentSidebarProps = {
  recentResearches: SerializedStockResearch[];
  recentLoading: boolean;
  total: number;
  activeResearchId?: string;
  showNewButton?: boolean;
  /** Route prefix for links, e.g. `/etfResearch`. */
  basePath?: string;
  className?: string;
};

export function StockResearchRecentSidebar({
  recentResearches,
  recentLoading,
  total,
  activeResearchId,
  showNewButton = false,
  basePath = "/stockResearch",
  className,
}: StockResearchRecentSidebarProps) {
  return (
    <aside
      className={cn("flex w-full flex-col gap-4", className)}
      aria-label="Recent stock researches"
    >
      {showNewButton ? (
        <Link
          href={basePath}
          className={cn(
            buttonVariants({ variant: "brand-accent", size: "sm" }),
            "w-full justify-center",
          )}
        >
          <Plus data-icon="inline-start" />
          New research
        </Link>
      ) : null}

      <div>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Recent research
          </h2>
          {total > 0 ? (
            <Link
              href={`${basePath}/history`}
              className="text-xs font-medium text-primary hover:underline"
            >
              Show all
            </Link>
          ) : null}
        </div>
        <ul className="mt-3 flex flex-col gap-2">
          {recentLoading ? (
            <>
              <Skeleton className="h-[72px] w-full rounded-xl" />
              <Skeleton className="h-[72px] w-full rounded-xl" />
            </>
          ) : recentResearches.length === 0 ? (
            <li className="rounded-xl border border-dashed border-border/70 bg-card/50 px-3 py-4 text-sm text-muted-foreground">
              Your stock researches will appear here.
            </li>
          ) : (
            recentResearches.map((research) => {
              const active = research.id === activeResearchId;
              return (
                <li key={research.id}>
                  <Link
                    href={`${basePath}/${research.id}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-xl border bg-card/80 px-3 py-3 shadow-paper transition-colors hover:bg-muted/35",
                      active
                        ? "border-accent/60 ring-2 ring-accent/25"
                        : "border-border/60",
                    )}
                  >
                    <p className="line-clamp-1 text-sm font-medium leading-snug">
                      {formatStockResearchTitle(research)}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {research.userPrompt ?? research.query}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          stockResearchStatusDotClass(research.status),
                        )}
                        aria-hidden
                      />
                      <span className="text-xs text-muted-foreground">
                        {formatStockResearchStatusLabel(research.status)} ·{" "}
                        {formatStockResearchDateTime(research.createdAt)}
                      </span>
                      {isStockResearchInProgress(research.status) ? (
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
