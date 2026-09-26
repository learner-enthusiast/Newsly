"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { countStoriesByCategory } from "@/services/news/newsRequestDisplay";
import type { SerializedNewsStory } from "@/services/news/newsRequestTypes";

type KeyTopicsSidebarProps = {
  stories: SerializedNewsStory[];
  className?: string;
};

export function KeyTopicsSidebar({ stories, className }: KeyTopicsSidebarProps) {
  const counts = countStoriesByCategory(stories);
  if (counts.size === 0) {
    return null;
  }

  return (
    <Card size="sm" className={className}>
      <CardHeader className="border-b pb-3">
        <CardTitle className="text-sm">Key topics in this briefing</CardTitle>
      </CardHeader>
      <CardContent className="pt-3">
        <ul className="flex flex-col gap-2">
          {[...counts.entries()].map(([category, count]) => (
            <li
              key={category}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="min-w-0 truncate font-medium">{category}</span>
              <span className="tabular-nums text-muted-foreground">{count}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
