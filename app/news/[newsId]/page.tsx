"use client";

import { NewsRequestContextCard } from "@/components/news/NewsRequestContextCard";
import { NewsRequestProgress } from "@/components/news/NewsRequestProgress";
import { NewsStoryListItem } from "@/components/news/NewsStoryListItem";
import type { StoryVoteState } from "@/components/news/StoryVoteControls";
import {
  activeProgressStepLabel,
  sanitizeNewsRequestError,
} from "@/services/news/newsRequestProgress";
import type { NewsRequestResultPayload } from "@/services/news/newsRequestTypes";
import { useNewsRequestPolling } from "@/hooks/useNewsRequestPolling";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

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
  const [deepDiveError, setDeepDiveError] = useState<string | null>(null);
  const [votingStoryId, setVotingStoryId] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);

  async function onDeepDive(storyId: string) {
    setDeepDiveError(null);
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
      setDeepDiveError(
        deepDiveErr instanceof Error ? deepDiveErr.message : "Deep dive failed",
      );
    } finally {
      setDeepDiveStoryId(null);
    }
  }

  async function onStoryVote(storyId: string, desiredVote: "UP" | "DOWN") {
    setVoteError(null);
    setVotingStoryId(storyId);
    try {
      const response = await fetch(`/api/news/stories/${storyId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote: desiredVote }),
      });
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
      setVoteError(
        voteErr instanceof Error ? voteErr.message : "Failed to save vote",
      );
    } finally {
      setVotingStoryId(null);
    }
  }

  async function onRetry() {
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
    } finally {
      setRetrying(false);
    }
  }

  const request = data?.newsRequest;
  const stories = data?.stories ?? [];
  const requestedCount = request?.storyCount ?? 0;
  const foundCount = stories.length;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-12">
      <div>
        <Link
          href="/news"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← New request
        </Link>
        <h1 className="font-display mt-2 text-2xl font-semibold">
          {isPending ? "News briefing in progress" : "News results"}
        </h1>
        {isPending && request ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {activeProgressStepLabel(request.loadingLogs, request.status) ??
              "Preparing your request"}
            …
          </p>
        ) : null}
      </div>

      {!newsId ? (
        <p className="text-sm text-red-600">Invalid news request link.</p>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading your request…</p>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {pollWarning ? (
        <p className="text-sm text-amber-700">{pollWarning}</p>
      ) : null}
      {retryError ? <p className="text-sm text-red-600">{retryError}</p> : null}
      {deepDiveError ? (
        <p className="text-sm text-red-600">{deepDiveError}</p>
      ) : null}
      {voteError ? <p className="text-sm text-red-600">{voteError}</p> : null}

      {request ? (
        <NewsRequestContextCard
          date={request.date}
          scope={request.scope}
          location={request.location}
          categories={request.categories}
          storyCount={request.storyCount}
          customQuery={request.customQuery}
          language={request.language}
          sources={request.sources}
          status={request.status}
        />
      ) : null}

      {isPending && request ? (
        <NewsRequestProgress
          loadingLogs={request.loadingLogs}
          status={request.status}
        />
      ) : null}

      {isFailed && request ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm">
          <p className="font-medium text-red-800">
            We couldn&apos;t complete this news request.
          </p>
          <p className="mt-1 text-red-700">
            {sanitizeNewsRequestError(request.error)}
          </p>
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
          >
            {retrying ? "Retrying…" : "Try again"}
          </button>
        </div>
      ) : null}

      {isSuccess ? (
        <p className="text-sm text-muted-foreground">
          {foundCount === 0
            ? "No sufficiently relevant stories were found for this request."
            : foundCount < requestedCount
              ? `${foundCount} relevant ${foundCount === 1 ? "story" : "stories"} found (you requested ${requestedCount}).`
              : `${foundCount} relevant ${foundCount === 1 ? "story" : "stories"} ready.`}
        </p>
      ) : null}

      {isSuccess && foundCount === 0 ? (
        <p className="text-sm text-muted-foreground">
          Try broadening categories, adjusting the date, or changing scope.
        </p>
      ) : null}

      <ul className="flex flex-col gap-4">
        {stories.map((story) => (
          <NewsStoryListItem
            key={story.id}
            story={story}
            showActions={isSuccess}
            deepDiveStoryId={deepDiveStoryId}
            votingStoryId={votingStoryId}
            onDeepDive={onDeepDive}
            onVote={onStoryVote}
          />
        ))}
      </ul>
    </main>
  );
}
