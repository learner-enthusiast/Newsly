"use client";

import { NewsStoryDetailView } from "@/components/news/results/NewsStoryDetailView";
import type { StoryVoteState } from "@/components/news/StoryVoteControls";
import type { NewsStoryPagePayload } from "@/services/news/newsRequestTypes";
import {
  applyCounterDelta,
  buildNewsStoryVoteSummary,
  resolveVoteCounterDelta,
  resolveVoteMutation,
} from "@/services/news/storyVoteLogic";
import { useAuth } from "@clerk/nextjs";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export default function NewsStoryPage() {
  const params = useParams<{ storyId: string }>();
  const storyId =
    typeof params.storyId === "string"
      ? params.storyId
      : Array.isArray(params.storyId)
        ? params.storyId[0]
        : undefined;
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();

  const [data, setData] = useState<NewsStoryPagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deepDiveStoryId, setDeepDiveStoryId] = useState<string | null>(null);
  const [votingStoryId, setVotingStoryId] = useState<string | null>(null);
  const [savingStoryId, setSavingStoryId] = useState<string | null>(null);
  const voteLockRef = useRef<Set<string>>(new Set());
  const saveLockRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!storyId || !isLoaded) {
      return;
    }

    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/news/stories/${storyId}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as NewsStoryPagePayload & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load story");
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
              : "Failed to load story",
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
  }, [storyId, isLoaded, isSignedIn]);

  async function onDeepDive(targetStoryId: string) {
    if (!isSignedIn) {
      return;
    }
    setDeepDiveStoryId(targetStoryId);
    try {
      const response = await fetch("/api/newsStoryChat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsStoryId: targetStoryId }),
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

      const snapshotRef: { current: NewsStoryPagePayload | null } = {
        current: null,
      };

      setData((current) => {
        if (!current || current.story.id !== targetStoryId) {
          return current;
        }
        snapshotRef.current = current;
        const story = current.story;
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
        return {
          ...current,
          story: { ...story, ...summary },
        };
      });

      setVotingStoryId(targetStoryId);
      try {
        const storyBefore = snapshotRef.current?.story;
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
          if (!current || current.story.id !== targetStoryId) {
            return current;
          }
          return {
            ...current,
            story: {
              ...current.story,
              upvotes: payload.upvotes,
              downvotes: payload.downvotes,
              netVotes: payload.netVotes,
              userVote: payload.userVote,
            },
          };
        });
      } catch (voteErr) {
        if (snapshotRef.current) {
          setData(snapshotRef.current);
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

      const snapshotRef: { current: NewsStoryPagePayload | null } = {
        current: null,
      };

      setData((current) => {
        snapshotRef.current = current;
        if (!current || current.story.id !== targetStoryId) {
          return current;
        }
        return {
          ...current,
          story: { ...current.story, userSaved: nextSaved },
        };
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
    [isSignedIn],
  );

  if (!storyId) {
    return (
      <p className="px-4 py-8 text-sm text-destructive">Invalid story link.</p>
    );
  }

  if (loading || !isLoaded) {
    return (
      <p className="px-4 py-8 text-sm text-muted-foreground">Loading story…</p>
    );
  }

  if (error || !data) {
    return (
      <p className="px-4 py-8 text-sm text-destructive" role="alert">
        {error ?? "Story not found."}
      </p>
    );
  }

  return (
    <NewsStoryDetailView
      data={data}
      isSignedIn={Boolean(isSignedIn)}
      showActions={Boolean(isSignedIn)}
      deepDiveStoryId={deepDiveStoryId}
      votingStoryId={votingStoryId}
      savingStoryId={savingStoryId}
      onDeepDive={onDeepDive}
      onVote={onStoryVote}
      onSaveToggle={onSaveToggle}
    />
  );
}
