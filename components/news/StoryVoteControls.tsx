"use client";

import { cn } from "cn";
import { ChevronDown, ChevronUp } from "lucide-react";

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
  const countLabel = `${vote.upvotes} up, ${vote.downvotes} down`;

  return (
    <div
      className={cn("flex items-center gap-1", className)}
      aria-label="Story votes"
    >
      <button
        type="button"
        disabled={voting}
        onClick={() => onVote(storyId, "UP")}
        className={cn(
          "inline-flex size-8 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-all hover:bg-muted hover:text-foreground disabled:opacity-50",
          vote.userVote === "UP" &&
            "border-primary/40 bg-primary/10 text-primary shadow-[0_0_14px_color-mix(in_srgb,var(--primary)_45%,transparent)] ring-2 ring-primary/35",
        )}
        aria-pressed={vote.userVote === "UP"}
        aria-label={
          vote.userVote === "UP"
            ? `Remove upvote (${countLabel})`
            : `Upvote this story (${countLabel})`
        }
        title={countLabel}
      >
        <ChevronUp className="size-5" strokeWidth={2.5} aria-hidden />
      </button>
      <button
        type="button"
        disabled={voting}
        onClick={() => onVote(storyId, "DOWN")}
        className={cn(
          "inline-flex size-8 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-all hover:bg-muted hover:text-foreground disabled:opacity-50",
          vote.userVote === "DOWN" &&
            "border-destructive/40 bg-destructive/10 text-destructive shadow-[0_0_14px_color-mix(in_srgb,var(--destructive)_45%,transparent)] ring-2 ring-destructive/35",
        )}
        aria-pressed={vote.userVote === "DOWN"}
        aria-label={
          vote.userVote === "DOWN"
            ? `Remove downvote (${countLabel})`
            : `Downvote this story (${countLabel})`
        }
        title={countLabel}
      >
        <ChevronDown className="size-5" strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  );
}
