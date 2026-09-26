"use client";

import { NewsStoryCard } from "@/components/news/results/NewsStoryCard";
import { NewsStorySignInBanner } from "@/components/news/results/NewsStorySignInBanner";
import { Button } from "@/components/ui/button";
import type { StoryVoteState } from "@/components/news/StoryVoteControls";
import type {
  NewsStoriesListPayload,
  SerializedNewsStory,
} from "@/services/news/newsRequestTypes";
import {
  applyCounterDelta,
  buildNewsStoryVoteSummary,
  resolveVoteCounterDelta,
  resolveVoteMutation,
} from "@/services/news/storyVoteLogic";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const DEFAULT_LIMIT = 20;

type NewsStoriesFeed = "community" | "saved";

type NewsStoriesListViewProps = {
  initialPage?: number;
  feed?: NewsStoriesFeed;
};

export function NewsStoriesListView({
  initialPage = 1,
  feed = "community",
}: NewsStoriesListViewProps) {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();
  const [page, setPage] = useState(initialPage);
  const [data, setData] = useState<NewsStoriesListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deepDiveStoryId, setDeepDiveStoryId] = useState<string | null>(null);
  const [votingStoryId, setVotingStoryId] = useState<string | null>(null);
  const [savingStoryId, setSavingStoryId] = useState<string | null>(null);
  const voteLockRef = useRef<Set<string>>(new Set());
  const saveLockRef = useRef<Set<string>>(new Set());

  const isSavedFeed = feed === "saved";
  const listApiPath = isSavedFeed
    ? `/api/news/stories/saved?page=${page}&limit=${DEFAULT_LIMIT}`
    : `/api/news/stories?page=${page}&limit=${DEFAULT_LIMIT}`;

  useEffect(() => {
    if (!isLoaded) {
      return;
    }
    if (isSavedFeed && !isSignedIn) {
      setLoading(false);
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(listApiPath, { cache: "no-store" });
        const payload = (await response.json()) as NewsStoriesListPayload & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load stories");
        }
        if (!cancelled) {
          setData(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setData(null);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load stories",
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
  }, [page, isLoaded, isSignedIn, isSavedFeed, listApiPath]);

  async function onDeepDive(storyId: string) {
    if (!isSignedIn) {
      return;
    }
    setDeepDiveStoryId(storyId);
    try {
      const response = await fetch("/api/newsStoryChat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsStoryId: storyId }),
      });
      const payload = (await response.json()) as {
        chatSessionId?: string;
        error?: string;
      };
      if (!response.ok || !payload.chatSessionId) {
        throw new Error(payload.error ?? "Failed to start deep dive");
      }
      router.push(`/chat/${payload.chatSessionId}`);
    } catch (deepDiveErr) {
      toast.error(
        deepDiveErr instanceof Error ? deepDiveErr.message : "Deep dive failed",
      );
    } finally {
      setDeepDiveStoryId(null);
    }
  }

  const onStoryVote = useCallback(
    async (targetStoryId: string, desiredVote: "UP" | "DOWN") => {
      if (!isSignedIn) {
        return;
      }
      if (voteLockRef.current.has(targetStoryId)) {
        return;
      }
      voteLockRef.current.add(targetStoryId);

      const snapshotRef: { current: SerializedNewsStory | null } = {
        current: null,
      };

      setData((current) => {
        if (!current) {
          return current;
        }
        const index = current.stories.findIndex(
          (story) => story.id === targetStoryId,
        );
        if (index < 0) {
          return current;
        }
        const story = current.stories[index]!;
        snapshotRef.current = story;
        const existingVote = story.userVote ?? null;
        const mutation = resolveVoteMutation(existingVote, desiredVote);
        const delta = resolveVoteCounterDelta(existingVote, desiredVote);
        const counters = applyCounterDelta(
          { upvotes: story.upvotes, downvotes: story.downvotes },
          delta,
        );
        const nextUserVote: StoryVoteState["userVote"] =
          mutation.action === "delete" ? null : desiredVote;
        const summary = buildNewsStoryVoteSummary({
          ...counters,
          userVote: nextUserVote,
        });
        const nextStories = [...current.stories];
        nextStories[index] = { ...story, ...summary };
        return { ...current, stories: nextStories };
      });

      setVotingStoryId(targetStoryId);
      try {
        const storyBefore = snapshotRef.current;
        const willClear = storyBefore?.userVote === desiredVote;

        const response = await fetch(
          `/api/news/stories/${targetStoryId}/vote`,
          {
            method: willClear ? "DELETE" : "POST",
            headers: willClear
              ? undefined
              : { "Content-Type": "application/json" },
            body: willClear ? undefined : JSON.stringify({ vote: desiredVote }),
          },
        );
        const payload = (await response.json()) as StoryVoteState & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to save vote");
        }

        setData((current) => {
          if (!current) {
            return current;
          }
          const index = current.stories.findIndex(
            (story) => story.id === targetStoryId,
          );
          if (index < 0) {
            return current;
          }
          const story = current.stories[index]!;
          const nextStories = [...current.stories];
          nextStories[index] = {
            ...story,
            upvotes: payload.upvotes,
            downvotes: payload.downvotes,
            netVotes: payload.netVotes,
            userVote: payload.userVote,
          };
          return { ...current, stories: nextStories };
        });
      } catch (voteErr) {
        if (snapshotRef.current) {
          setData((current) => {
            if (!current) {
              return current;
            }
            const index = current.stories.findIndex(
              (story) => story.id === targetStoryId,
            );
            if (index < 0) {
              return current;
            }
            const nextStories = [...current.stories];
            nextStories[index] = snapshotRef.current!;
            return { ...current, stories: nextStories };
          });
        }
        toast.error(
          voteErr instanceof Error ? voteErr.message : "Failed to save vote",
        );
      } finally {
        voteLockRef.current.delete(targetStoryId);
        setVotingStoryId(null);
      }
    },
    [isSignedIn],
  );

  const onSaveToggle = useCallback(
    async (targetStoryId: string, nextSaved: boolean) => {
      if (!isSignedIn) {
        return;
      }
      if (saveLockRef.current.has(targetStoryId)) {
        return;
      }
      saveLockRef.current.add(targetStoryId);

      const snapshotRef: { current: NewsStoriesListPayload | null } = {
        current: null,
      };

      setData((current) => {
        snapshotRef.current = current;
        if (!current) {
          return current;
        }
        if (isSavedFeed && !nextSaved) {
          const nextStories = current.stories.filter(
            (story) => story.id !== targetStoryId,
          );
          const nextTotal = Math.max(0, current.total - 1);
          return {
            ...current,
            stories: nextStories,
            total: nextTotal,
            totalPages:
              nextTotal === 0 ? 0 : Math.ceil(nextTotal / current.limit),
          };
        }
        const index = current.stories.findIndex(
          (story) => story.id === targetStoryId,
        );
        if (index < 0) {
          return current;
        }
        const nextStories = [...current.stories];
        nextStories[index] = {
          ...nextStories[index]!,
          userSaved: nextSaved,
        };
        return { ...current, stories: nextStories };
      });

      setSavingStoryId(targetStoryId);
      try {
        const response = await fetch(
          `/api/news/stories/${targetStoryId}/save`,
          {
            method: nextSaved ? "POST" : "DELETE",
          },
        );
        const payload = (await response.json()) as { saved?: boolean; error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to update saved story");
        }
      } catch (saveErr) {
        if (snapshotRef.current) {
          setData(snapshotRef.current);
        }
        toast.error(
          saveErr instanceof Error ? saveErr.message : "Failed to update save",
        );
      } finally {
        saveLockRef.current.delete(targetStoryId);
        setSavingStoryId(null);
      }
    },
    [isSignedIn, isSavedFeed],
  );

  if (!isLoaded || loading) {
    return (
      <main className="min-h-0 flex-1 overflow-y-auto bg-background">
        <p className="px-4 py-8 text-sm text-muted-foreground">
          Loading stories…
        </p>
      </main>
    );
  }

  if (isSavedFeed && !isSignedIn) {
    return (
      <main className="min-h-0 flex-1 overflow-y-auto bg-background">
        <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6 md:py-8">
          <header className="mb-6 space-y-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              Saved stories
            </h1>
            <p className="text-sm text-muted-foreground">
              Sign in to view stories you&apos;ve bookmarked.
            </p>
          </header>
          <NewsStorySignInBanner redirectPath="/newsStory/saved" />
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-0 flex-1 overflow-y-auto bg-background">
        <p className="px-4 py-8 text-sm text-destructive" role="alert">
          {error ?? "Could not load stories."}
        </p>
      </main>
    );
  }

  const rankOffset = (data.page - 1) * data.limit;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6 md:py-8">
        <header className="mb-6 space-y-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight">
                {isSavedFeed ? "Saved stories" : "Community stories"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isSavedFeed
                  ? "Stories you've saved for later, newest saved first."
                  : "Top-voted briefings from Newsly, newest and most upvoted first."}
              </p>
            </div>
            {isSignedIn ? (
              <Link
                href={isSavedFeed ? "/newsStory" : "/newsStory/saved"}
                className="text-sm font-medium text-primary hover:underline"
              >
                {isSavedFeed ? "Browse community stories" : "View saved stories"}
              </Link>
            ) : null}
          </div>
        </header>

        {!isSignedIn && !isSavedFeed ? (
          <div className="mb-6">
            <NewsStorySignInBanner
              redirectPath={
                page > 1 ? `/newsStory?page=${page}` : "/newsStory"
              }
            />
          </div>
        ) : null}

        {data.stories.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isSavedFeed
              ? "You haven't saved any stories yet. Browse community stories and tap Save."
              : "No stories yet."}
          </p>
        ) : (
          <div className="space-y-4">
            {data.stories.map((story, index) => (
              <NewsStoryCard
                key={story.id}
                story={story}
                rank={rankOffset + index + 1}
                showActions={Boolean(isSignedIn)}
                guestActionsVisible={!isSignedIn}
                signInRedirectUrl={`/newsStory/${story.id}`}
                deepDiveStoryId={deepDiveStoryId}
                votingStoryId={votingStoryId}
                savingStoryId={savingStoryId}
                onDeepDive={onDeepDive}
                onVote={onStoryVote}
                onSaveToggle={onSaveToggle}
              />
            ))}
          </div>
        )}

        {data.totalPages > 1 ? (
          <nav
            className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-6"
            aria-label="Stories pagination"
          >
            <p className="text-sm text-muted-foreground">
              Page {data.page} of {data.totalPages} · {data.total} stories
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={data.page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={data.page >= data.totalPages}
                onClick={() =>
                  setPage((current) =>
                    data.totalPages ? Math.min(data.totalPages, current + 1) : current,
                  )
                }
              >
                Next
              </Button>
            </div>
          </nav>
        ) : null}
      </div>
    </main>
  );
}
