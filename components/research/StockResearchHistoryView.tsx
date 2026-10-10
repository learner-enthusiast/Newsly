"use client";

import {
  formatStockResearchDateTime,
  stockResearchStatusDotClass,
} from "@/components/research/StockResearchRecentSidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  formatStockResearchStatusLabel,
  formatStockResearchTitle,
  STOCK_RESEARCHES_PAGE_SIZE,
  type StockResearchListPayload,
} from "@/services/stockResearch/stockResearchTypes";
import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export function StockResearchHistoryView() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<StockResearchListPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(STOCK_RESEARCHES_PAGE_SIZE),
        });
        const response = await fetch(`/api/stockResearch?${params}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as StockResearchListPayload & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load stock researches");
        }
        if (!cancelled) {
          setData(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load stock researches",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [page]);

  return (
    <main className="mx-auto flex w-full max-w-3xl min-w-0 flex-1 flex-col px-4 py-6 md:px-6">
      <div className="mb-6 flex flex-col gap-3">
        <Link
          href="/stockResearch"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to stock research
        </Link>
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Stock research history
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your stock researches, newest first.
          </p>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {loading && !data ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      ) : data && data.stockResearches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No stock researches yet. Pick a stock to start one.
        </p>
      ) : data ? (
        <ul
          className={cn(
            "flex flex-col gap-3 transition-opacity",
            loading && "opacity-60",
          )}
        >
          {data.stockResearches.map((research) => (
            <li key={research.id}>
              <Link
                href={`/stockResearch/${research.id}`}
                className="group flex items-start justify-between gap-3 rounded-2xl border border-border/70 bg-card p-5 shadow-sm transition-[box-shadow,border-color] hover:border-border hover:shadow-md"
              >
                <div className="min-w-0">
                  <p className="font-display text-lg font-semibold tracking-tight">
                    {formatStockResearchTitle(research)}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {research.userPrompt ?? research.query}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        stockResearchStatusDotClass(research.status),
                      )}
                      aria-hidden
                    />
                    {formatStockResearchStatusLabel(research.status)} ·{" "}
                    {formatStockResearchDateTime(research.createdAt)}
                  </div>
                </div>
                <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {data && data.totalPages > 1 ? (
        <nav
          className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-6"
          aria-label="Stock research pagination"
        >
          <p className="text-sm text-muted-foreground">
            Page {data.page} of {data.totalPages} · {data.total} researches
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || data.page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || data.page >= data.totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </div>
        </nav>
      ) : null}
    </main>
  );
}
