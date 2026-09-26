"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { countStoriesByCategory } from "@/services/news/newsRequestDisplay";
import type { SerializedNewsStory } from "@/services/news/newsRequestTypes";
import { cn } from "@/lib/utils";
import gsap from "gsap";
import { useLayoutEffect, useRef } from "react";

export const ALL_STORIES_TAB = "__all__";

type NewsCategoryTabsProps = {
  stories: SerializedNewsStory[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
};

export function NewsCategoryTabs({
  stories,
  value,
  onValueChange,
  className,
}: NewsCategoryTabsProps) {
  const listWrapRef = useRef<HTMLDivElement>(null);
  const counts = countStoriesByCategory(stories);
  const total = stories.length;

  useLayoutEffect(() => {
    const list = listWrapRef.current;
    if (!list) {
      return;
    }
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) {
      return;
    }
    gsap.fromTo(
      list,
      { opacity: 0.85, y: 4 },
      { opacity: 1, y: 0, duration: 0.22, ease: "power2.out" },
    );
  }, [value]);

  if (total === 0) {
    return null;
  }

  return (
    <Tabs
      value={value}
      onValueChange={(next) => onValueChange(String(next))}
      className={cn("w-full min-w-0", className)}
    >
      <div ref={listWrapRef} className="w-full min-w-0 overflow-x-auto">
      <TabsList
        variant="line"
        className="h-auto w-full max-w-full flex-wrap justify-start gap-1 bg-transparent p-0"
      >
        <TabsTrigger value={ALL_STORIES_TAB} className="shrink-0">
          All Stories ({total})
        </TabsTrigger>
        {[...counts.entries()].map(([category, count]) => (
          <TabsTrigger key={category} value={category} className="shrink-0">
            {category} ({count})
          </TabsTrigger>
        ))}
      </TabsList>
      </div>
    </Tabs>
  );
}

export function filterStoriesByCategoryTab(
  stories: SerializedNewsStory[],
  tab: string,
): SerializedNewsStory[] {
  if (tab === ALL_STORIES_TAB) {
    return stories;
  }
  return stories.filter(
    (story) => story.category?.trim().toLowerCase() === tab.toLowerCase(),
  );
}
