"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type TrendingCardData = {
  id: string;
  category: string;
  categoryTone: string;
  title: string;
  timeLabel: string;
  location: string;
};

type TrendingCardProps = {
  story: TrendingCardData;
  className?: string;
};

export function TrendingCard({ story, className }: TrendingCardProps) {
  return (
    <Card
      size="sm"
      className={cn(
        "group h-full overflow-hidden border-border/60 bg-card/95 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-editorial",
        className,
      )}
    >
      <div
        className={cn(
          "mx-3 mt-3 aspect-[4/3] rounded-xl bg-linear-to-br",
          story.categoryTone,
        )}
        role="img"
        aria-label={`Demo illustration for ${story.category}`}
      />
      <CardHeader className="gap-2 pb-2">
        <Badge variant="outline" className="w-fit text-[10px]">
          Demo · {story.category}
        </Badge>
        <CardTitle className="text-base leading-snug">{story.title}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        {story.timeLabel} · {story.location}
      </CardContent>
    </Card>
  );
}
