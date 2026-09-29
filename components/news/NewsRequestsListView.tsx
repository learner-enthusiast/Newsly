"use client";

import { NewsRequestDetailCard } from "@/components/news/NewsRequestDetailCard";
import { prefersReducedMotion } from "@/components/chat/useChatMotion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { USER_NEWS_REQUESTS_PAGE_SIZE } from "@/services/news/newsRequestTypes";
import type { SerializedNewsRequest } from "@/services/news/newsRequestTypes";
import gsap from "gsap";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

type NewsRequestsPageResponse = {
  newsRequests: SerializedNewsRequest[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  error?: string;
};

export function NewsRequestsListView() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<NewsRequestsPageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(USER_NEWS_REQUESTS_PAGE_SIZE),
        });
        const response = await fetch(`/api/news/newsRequests?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as NewsRequestsPageResponse;
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load news requests");
        }
        if (!cancelled) {
          setData(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load news requests",
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

  useLayoutEffect(() => {
    const root = listRef.current;
    if (!root || prefersReducedMotion() || loading) {
      return;
    }
    const cards = root.querySelectorAll("[data-news-request-card]");
    if (cards.length === 0) {
      return;
    }
    const ctx = gsap.context(() => {
      gsap.fromTo(
        cards,
        { opacity: 0, y: 18, scale: 0.985 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.45,
          stagger: 0.06,
          ease: "power2.out",
        },
      );
    }, root);
    return () => ctx.revert();
  }, [data?.page, data?.newsRequests, loading]);

  return (
    <main className="mx-auto flex w-full max-w-3xl min-w-0 flex-1 flex-col px-4 py-6 md:px-6">
      <div className="mb-6 flex flex-col gap-3">
        <Link
          href="/news"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to generate
        </Link>
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            News requests
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your briefings, newest first. Open a card to view stories.
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
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      ) : data && data.newsRequests.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No news requests yet. Generate a briefing to see it here.
        </p>
      ) : data ? (
        <div ref={listRef} className="flex flex-col gap-4">
          {data.newsRequests.map((request) => (
            <NewsRequestDetailCard key={request.id} request={request} />
          ))}
        </div>
      ) : null}

      {data && data.totalPages > 1 ? (
        <nav
          className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-6"
          aria-label="News requests pagination"
        >
          <p className="text-sm text-muted-foreground">
            Page {data.page} of {data.totalPages} · {data.total} requests
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || data.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || data.page >= data.totalPages}
              onClick={() =>
                setPage((current) => Math.min(data.totalPages, current + 1))
              }
            >
              Next
            </Button>
          </div>
        </nav>
      ) : null}
    </main>
  );
}
