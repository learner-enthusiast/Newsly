"use client";

import {
  TrendingCard,
  trendingStoryToCardData,
} from "@/components/landing/TrendingCard";
import { prefersReducedMotion } from "@/components/landing/useLandingMotion";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShimmerLoadingStatus,
  TRENDING_LOADING_MESSAGES,
} from "@/components/ui/shimmer-loading-status";
import type { SerializedTrendingNewsStory } from "@/services/news/newsRequestTypes";
import gsap from "gsap";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export function TrendingSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [stories, setStories] = useState<SerializedTrendingNewsStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section || loading || stories.length === 0 || prefersReducedMotion()) {
      return;
    }

    const cards = section.querySelectorAll("[data-trend-card]");
    if (cards.length === 0) {
      return;
    }

    gsap.fromTo(
      cards,
      { opacity: 0, y: 20 },
      {
        opacity: 1,
        y: 0,
        duration: 0.45,
        stagger: 0.08,
        ease: "power2.out",
      },
    );
  }, [loading, stories]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/news/trending");
        const payload = (await response.json()) as {
          stories?: SerializedTrendingNewsStory[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load trending stories");
        }
        if (!cancelled) {
          setStories(payload.stories ?? []);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setStories([]);
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Failed to load trending stories",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section id="stories" ref={sectionRef} className="border-t border-border/25 py-24 sm:py-28">
      <div className="landing-section flex flex-col gap-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[0.75rem] font-medium tracking-[0.2em] text-[#c85d3f] uppercase">
              Already on Newsly
            </p>
            <h2 className="font-display mt-5 text-4xl font-normal tracking-tight sm:text-5xl">
              Stories people are opening.
            </h2>
            <p className="mt-4 max-w-xl text-muted-foreground">
              Public stories from the last seven days, ordered by upvotes. These are real briefings, not sample cards.
            </p>
          </div>
          <Link
            href="/newsStory"
            className="inline-flex items-center gap-1 text-sm font-medium text-[#c85d3f] hover:underline"
          >
            Explore more
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>

        {error ? (
          <p className="text-sm text-muted-foreground" role="status">
            Could not load trending stories. {error}
          </p>
        ) : null}

        {loading ? (
          <div className="flex flex-col gap-6">
            <ShimmerLoadingStatus
              layout="panel"
              messages={TRENDING_LOADING_MESSAGES}
              statusLabel="Loading trending stories"
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-[320px] w-full rounded-xl" />
              ))}
            </div>
          </div>
        ) : stories.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 bg-card/40 px-4 py-8 text-center text-sm text-muted-foreground">
            No trending stories yet. Upvote stories in your briefings to see them
            here.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stories.map((story, index) => (
              <div key={story.id} data-trend-card>
                <TrendingCard
                  story={trendingStoryToCardData(story, index + 1)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
