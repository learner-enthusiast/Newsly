"use client";

import { cn } from "@/lib/utils";
import { SignInButton } from "@clerk/nextjs";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import gsap from "gsap";
import { useLayoutEffect, useRef, type ReactNode } from "react";

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
  /** When set, vote buttons redirect to sign-in instead of calling onVote. */
  signInRedirectUrl?: string;
};

function VoteButton({
  signInRedirectUrl,
  onClick,
  disabled,
  className,
  ariaLabel,
  ariaPressed,
  children,
}: {
  signInRedirectUrl?: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  ariaLabel: string;
  ariaPressed?: boolean;
  children: ReactNode;
}) {
  if (signInRedirectUrl) {
    return (
      <SignInButton mode="redirect" forceRedirectUrl={signInRedirectUrl}>
        <button
          type="button"
          className={className}
          aria-label={ariaLabel}
          aria-pressed={ariaPressed}
        >
          {children}
        </button>
      </SignInButton>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={className}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
    >
      {children}
    </button>
  );
}

export function StoryVoteControls({
  storyId,
  vote,
  onVote,
  voting = false,
  className,
  signInRedirectUrl,
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
      <VoteButton
        signInRedirectUrl={signInRedirectUrl}
        disabled={voting}
        onClick={() => onVote(storyId, "UP")}
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-full border border-transparent px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground disabled:opacity-50",
          vote.userVote === "UP" &&
            "border-emerald-600/35 bg-emerald-600/10 text-emerald-900 dark:text-emerald-300",
        )}
        aria-pressed={vote.userVote === "UP"}
        ariaLabel={
          vote.userVote === "UP"
            ? `Remove upvote, ${vote.upvotes} upvotes`
            : `Upvote, ${vote.upvotes} upvotes`
        }
      >
        <ThumbsUp className="size-4" aria-hidden />
        <span className="tabular-nums">{vote.upvotes}</span>
      </VoteButton>
      <VoteButton
        signInRedirectUrl={signInRedirectUrl}
        disabled={voting}
        onClick={() => onVote(storyId, "DOWN")}
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-full border border-transparent px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground disabled:opacity-50",
          vote.userVote === "DOWN" &&
            "border-destructive/35 bg-destructive/10 text-destructive",
        )}
        aria-pressed={vote.userVote === "DOWN"}
        ariaLabel={
          vote.userVote === "DOWN"
            ? `Remove downvote, ${vote.downvotes} downvotes`
            : `Downvote, ${vote.downvotes} downvotes`
        }
      >
        <ThumbsDown className="size-4" aria-hidden />
        <span className="tabular-nums">{vote.downvotes}</span>
      </VoteButton>
    </div>
  );
}
