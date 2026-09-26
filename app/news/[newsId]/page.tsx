"use client";

import { NewsResultsView } from "@/components/news/results/NewsResultsView";
import {
  NEWS_REQUEST_LOADING_MESSAGES,
  ShimmerLoadingStatus,
} from "@/components/ui/shimmer-loading-status";
import type { StoryVoteState } from "@/components/news/StoryVoteControls";
import { useNewsRequestPolling } from "@/hooks/useNewsRequestPolling";
import type { NewsRequestResultPayload } from "@/services/news/newsRequestTypes";
import {
  applyCounterDelta,
  buildNewsStoryVoteSummary,
  resolveVoteCounterDelta,
  resolveVoteMutation,
} from "@/services/news/storyVoteLogic";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

export default function NewsResultPage() {
  const params = useParams<{ newsId: string }>();
  const newsId =
    typeof params.newsId === "string"
      ? params.newsId
      : Array.isArray(params.newsId)
        ? params.newsId[0]
        : undefined;
  const router = useRouter();
  const {
    data,
    setData,
    error,
    pollWarning,
    restartPolling,
    isLoading,
    isPending,
    isSuccess,
    isFailed,
  } = useNewsRequestPolling(newsId);

  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [deepDiveStoryId, setDeepDiveStoryId] = useState<string | null>(null);
  const [votingStoryId, setVotingStoryId] = useState<string | null>(null);
  const [savingStoryId, setSavingStoryId] = useState<string | null>(null);
  const voteLockRef = useRef<Set<string>>(new Set());
  const saveLockRef = useRef<Set<string>>(new Set());

  async function onDeepDive(storyId: string) {
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
    async (storyId: string, desiredVote: "UP" | "DOWN") => {
      if (voteLockRef.current.has(storyId)) {
        return;
      }
      voteLockRef.current.add(storyId);

      const snapshotRef: { current: NewsRequestResultPayload | null } = {
        current: null,
      };

      setData((current) => {
        if (!current) {
          return current;
        }
        snapshotRef.current = current;
        const story = current.stories.find((item) => item.id === storyId);
        if (!story) {
          return current;
        }
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
          stories: current.stories.map((item) =>
            item.id === storyId ? { ...item, ...summary } : item,
          ),
        };
      });

      setVotingStoryId(storyId);
      try {
        const storyBefore = snapshotRef.current?.stories.find(
          (item) => item.id === storyId,
        );
        const willClear = storyBefore?.userVote === desiredVote;

        const response = await fetch(
          willClear
            ? `/api/news/stories/${storyId}/vote`
            : `/api/news/stories/${storyId}/vote`,
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
          return {
            ...current,
            stories: current.stories.map((story) =>
              story.id === storyId
                ? {
                    ...story,
                    upvotes: payload.upvotes,
                    downvotes: payload.downvotes,
                    netVotes: payload.netVotes,
                    userVote: payload.userVote,
                  }
                : story,
            ),
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
        voteLockRef.current.delete(storyId);
        setVotingStoryId(null);
      }
    },
    [setData],
  );

  const onSaveToggle = useCallback(
    async (storyId: string, nextSaved: boolean) => {
      if (saveLockRef.current.has(storyId)) {
        return;
      }
      saveLockRef.current.add(storyId);

      const snapshotRef: { current: NewsRequestResultPayload | null } = {
        current: null,
      };

      setData((current) => {
        snapshotRef.current = current;
        if (!current) {
          return current;
        }
        return {
          ...current,
          stories: current.stories.map((story) =>
            story.id === storyId ? { ...story, userSaved: nextSaved } : story,
          ),
        };
      });

      setSavingStoryId(storyId);
      try {
        const response = await fetch(`/api/news/stories/${storyId}/save`, {
          method: nextSaved ? "POST" : "DELETE",
        });
        const payload = (await response.json()) as { error?: string };
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
        saveLockRef.current.delete(storyId);
        setSavingStoryId(null);
      }
    },
    [setData],
  );

  async function onRetry() {
    if (!newsId) {
      return;
    }
    setRetrying(true);
    setRetryError(null);
    try {
      const response = await fetch(`/api/news/${newsId}`, { method: "POST" });
      const payload = (await response.json()) as NewsRequestResultPayload & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Retry failed");
      }
      setData({
        newsRequest: payload.newsRequest,
        stories: payload.stories ?? [],
      });
      restartPolling();
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Retry failed");
      toast.error(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <>
      {!newsId ? (
        <p className="px-4 py-8 text-sm text-destructive">Invalid news request link.</p>
      ) : null}

      {isLoading ? (
        <ShimmerLoadingStatus
          messages={NEWS_REQUEST_LOADING_MESSAGES}
          statusLabel="Loading news request"
          className="min-h-[40vh]"
        />
      ) : null}

      {error ? (
        <p className="px-4 py-2 text-sm text-destructive">{error}</p>
      ) : null}
      {pollWarning ? (
        <p className="px-4 py-2 text-sm text-amber-800">{pollWarning}</p>
      ) : null}
      {retryError ? (
        <p className="px-4 py-2 text-sm text-destructive">{retryError}</p>
      ) : null}

      {newsId && data ? (
        <NewsResultsView
          newsId={newsId}
          data={data}
          isPending={isPending}
          isSuccess={isSuccess}
          isFailed={isFailed}
          showActions={isSuccess}
          deepDiveStoryId={deepDiveStoryId}
          votingStoryId={votingStoryId}
          savingStoryId={savingStoryId}
          onDeepDive={onDeepDive}
          onVote={onStoryVote}
          onSaveToggle={onSaveToggle}
          onRetry={onRetry}
          retrying={retrying}
        />
      ) : null}
    </>
  );
}
