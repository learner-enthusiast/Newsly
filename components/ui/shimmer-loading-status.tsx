"use client";

import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export const NEWS_STORIES_LOADING_MESSAGES = [
  "Gathering community stories…",
  "Ranking by upvotes…",
  "Scanning recent headlines…",
  "Finding what readers saved…",
  "Pulling sources together…",
  "Sorting the briefing feed…",
] as const;

export const NEWS_STORY_LOADING_MESSAGES = [
  "Opening this story…",
  "Loading sources and takeaways…",
  "Preparing the deep dive…",
  "Checking community votes…",
] as const;

export const NEWS_REQUEST_LOADING_MESSAGES = [
  "Checking your briefing status…",
  "Syncing pipeline progress…",
  "Loading your stories…",
  "Reviewing research steps…",
] as const;

export const CHAT_LOADING_MESSAGES = [
  "Searching trusted sources…",
  "Reading recent coverage…",
  "Cross-checking market context…",
  "Drafting your answer…",
  "Following the research trail…",
] as const;

export const TRENDING_LOADING_MESSAGES = [
  "Finding what’s trending…",
  "Tallying community upvotes…",
  "Surfacing this week’s topics…",
] as const;

function pickNextMessage(messages: readonly string[], current: string): string {
  if (messages.length === 0) {
    return "Loading…";
  }
  if (messages.length === 1) {
    return messages[0]!;
  }
  let next = messages[Math.floor(Math.random() * messages.length)]!;
  let attempts = 0;
  while (next === current && attempts < 10) {
    next = messages[Math.floor(Math.random() * messages.length)]!;
    attempts += 1;
  }
  return next;
}

type ShimmerLoadingStatusProps = {
  messages?: readonly string[];
  className?: string;
  statusLabel?: string;
  layout?: "inline" | "page" | "panel";
};

export function ShimmerLoadingStatus({
  messages = NEWS_STORIES_LOADING_MESSAGES,
  className,
  statusLabel = "Loading",
  layout = "page",
}: ShimmerLoadingStatusProps) {
  const pool = useMemo(() => [...messages], [messages]);
  const initialPhrase = pool[0] ?? "Loading…";
  const [phrase, setPhrase] = useState(initialPhrase);

  useEffect(() => {
    if (pool.length < 2) {
      return;
    }
    const interval = window.setInterval(() => {
      setPhrase((current) => pickNextMessage(pool, current));
    }, 2_600);
    return () => window.clearInterval(interval);
  }, [pool]);

  const body = (
    <div
      className={cn(
        "flex items-center gap-2.5",
        layout === "page" || layout === "panel"
          ? "flex-col text-center"
          : undefined,
      )}
    >
      <Loader2
        className="size-5 shrink-0 animate-spin text-muted-foreground"
        aria-hidden
      />
      <p className="shimmer-loading-text max-w-sm text-sm font-medium">
        {phrase}
      </p>
    </div>
  );

  if (layout === "inline") {
    return (
      <div
        className={cn(className)}
        role="status"
        aria-live="polite"
        aria-label={statusLabel}
      >
        {body}
      </div>
    );
  }

  if (layout === "panel") {
    return (
      <div
        className={cn("flex justify-center py-6", className)}
        role="status"
        aria-live="polite"
        aria-label={statusLabel}
      >
        {body}
      </div>
    );
  }

  return (
    <main
      className={cn(
        "flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto bg-background px-4 py-12",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={statusLabel}
    >
      {body}
    </main>
  );
}
