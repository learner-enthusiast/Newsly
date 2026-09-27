"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/services/news/newsRequestDisplay";
import type { SerializedNewsStory } from "@/services/news/newsRequestTypes";
import { cn } from "@/lib/utils";
import { ArrowUp, MapPin } from "lucide-react";
import Link from "next/link";
import type { RefObject } from "react";

type NewsStoryPageHeaderProps = {
  story: SerializedNewsStory;
  canViewFullBriefing: boolean;
  newsRequestId?: string | null;
  className?: string;
  headerRef?: RefObject<HTMLElement | null>;
};

export function NewsStoryPageHeader({
  story,
  canViewFullBriefing,
  newsRequestId,
  className,
  headerRef,
}: NewsStoryPageHeaderProps) {
  const publishedLabel = formatRelativeTime(story.publishedAt);

  return (
    <header ref={headerRef} className={cn("space-y-4", className)}>
      <Link
        href="/#topics"
        className="inline-flex text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Back to trending
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {story.category?.trim() ? (
              <Badge variant="outline">{story.category}</Badge>
            ) : null}
            {story.location?.trim() ? (
              <Badge variant="outline" className="gap-1">
                <MapPin className="size-3" aria-hidden />
                {story.location.trim()}
              </Badge>
            ) : null}
            <Badge variant="secondary" className="gap-1">
              <ArrowUp className="size-3" aria-hidden />
              {story.upvotes} upvotes
            </Badge>
            {publishedLabel ? (
              <Badge variant="outline">{publishedLabel}</Badge>
            ) : null}
          </div>
          {canViewFullBriefing && newsRequestId ? (
            <Button variant="link" className="h-auto p-0" nativeButton={false} render={<Link href={`/news/${newsRequestId}`} />}>
              View full briefing
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
