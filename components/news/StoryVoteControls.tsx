"use client";

import { cn } from "@/lib/utils";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import gsap from "gsap";
import { useLayoutEffect, useRef } from "react";

export type StoryVoteState = {
  upvotes: number;
  downvotes: number;
  netVotes: number;
  userVote: "UP" | "DOWN" | null;
};

type StoryVoteControlsProps = {
  storyId: string;
  vote: StoryVoteState;
  onVote: (storyId: string, desiredVote: "UP" | "DOWN") => Promise<void>;
  voting?: boolean;
  className?: string;
};

export function StoryVoteControls({
  storyId,
  vote,
  onVote,
  voting = false,
  className,
}: StoryVoteControlsProps) {
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) {
      return;
    }
    const target =
      vote.userVote === "UP"
        ? upRef.current
        : vote.userVote === "DOWN"
          ? downRef.current
          : null;
    if (!target) {
      return;
    }
    gsap.fromTo(
      target,
      { scale: 0.92 },
      { scale: 1, duration: 0.18, ease: "back.out(2)" },
    );
  }, [vote.userVote, vote.upvotes, vote.downvotes]);

  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      aria-label="Story votes"
    >
      <button
        ref={upRef}
        type="button"
        disabled={voting}
        onClick={() => onVote(storyId, "UP")}
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-full border border-transparent px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground disabled:opacity-50",
          vote.userVote === "UP" &&
            "border-emerald-600/35 bg-emerald-600/10 text-emerald-900 dark:text-emerald-300",
        )}
        aria-pressed={vote.userVote === "UP"}
        aria-label={
          vote.userVote === "UP"
            ? `Remove upvote, ${vote.upvotes} upvotes`
            : `Upvote, ${vote.upvotes} upvotes`
        }
      >
        <ThumbsUp className="size-4" aria-hidden />
        <span className="tabular-nums">{vote.upvotes}</span>
      </button>
      <button
        ref={downRef}
        type="button"
        disabled={voting}
        onClick={() => onVote(storyId, "DOWN")}
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-full border border-transparent px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground disabled:opacity-50",
          vote.userVote === "DOWN" &&
            "border-destructive/35 bg-destructive/10 text-destructive",
        )}
        aria-pressed={vote.userVote === "DOWN"}
        aria-label={
          vote.userVote === "DOWN"
            ? `Remove downvote, ${vote.downvotes} downvotes`
            : `Downvote, ${vote.downvotes} downvotes`
        }
      >
        <ThumbsDown className="size-4" aria-hidden />
        <span className="tabular-nums">{vote.downvotes}</span>
      </button>
    </div>
  );
}
