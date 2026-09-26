"use client";

import { categoryToneForTrending } from "@/components/landing/trendingUiUtils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime } from "@/services/news/newsRequestDisplay";
import type { SerializedTrendingNewsStory } from "@/services/news/newsRequestTypes";
import { cn } from "@/lib/utils";
import { ArrowUp } from "lucide-react";
import Link from "next/link";

export type TrendingCardData = {
  id: string;
  newsRequestId: string;
  category: string;
  categoryTone: string;
  title: string;
  description: string;
  timeLabel: string;
  location: string;
  upvotes: number;
  rank?: number;
};

export function trendingStoryToCardData(
  story: SerializedTrendingNewsStory,
  rank?: number,
): TrendingCardData {
  const publishedLabel = formatRelativeTime(story.publishedAt) ?? "Recently";
  const blurb =
    story.description?.trim() ||
    (story.summary.length > 140
      ? `${story.summary.slice(0, 137)}…`
      : story.summary);

  return {
    id: story.id,
    newsRequestId: story.newsRequestId,
    category: story.category,
    categoryTone: categoryToneForTrending(story.category),
    title: story.title,
    description: blurb,
    timeLabel: publishedLabel,
    location: story.location?.trim() || "—",
    upvotes: story.upvotes,
    rank,
  };
}

type TrendingCardProps = {
  story: TrendingCardData;
  className?: string;
};

export function TrendingCard({ story, className }: TrendingCardProps) {
  return (
    <Link
      href={`/newsStory/${story.id}`}
      className={cn("block h-full", className)}
    >
      <Card
        size="sm"
        className={cn(
          "group h-full overflow-hidden border-border/60 bg-card/95 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-editorial",
        )}
      >
        <div
          className={cn(
            "relative mx-3 mt-3 aspect-[4/3] rounded-xl bg-linear-to-br",
            story.categoryTone,
          )}
          role="img"
          aria-label={`${story.category} story`}
        >
          {story.rank != null ? (
            <span className="absolute top-2 left-2 flex size-8 items-center justify-center rounded-full bg-background/90 text-sm font-semibold shadow-sm">
              {story.rank}
            </span>
          ) : null}
        </div>
        <CardHeader className="gap-2 pb-2">
          <div className="flex items-center justify-between gap-2">
            <Badge variant="outline" className="w-fit text-[10px]">
              {story.category}
            </Badge>
            <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-[#c85d3f]">
              <ArrowUp className="size-4" aria-hidden />
              <span className="tabular-nums">{story.upvotes}</span>
            </span>
          </div>
          <CardTitle className="text-base leading-snug">{story.title}</CardTitle>
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {story.description}
          </p>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          {story.timeLabel} · {story.location}
        </CardContent>
      </Card>
    </Link>
  );
}
