"use client";

import { ChatMarkdown } from "@/components/chat/ChatMarkdown";
import {
  StoryVoteControls,
  type StoryVoteState,
} from "@/components/news/StoryVoteControls";
import {
  StorySourceLinks,
  type StorySourceLink,
} from "@/components/news/StorySourceLinks";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type NewsStory = {
  id: string;
  title: string;
  summary: string;
  description: string | null;
  content: string;
  category: string;
  importanceScore: number | null;
  sourceUrls: StorySourceLink[];
  upvotes: number;
  downvotes: number;
  netVotes: number;
  userVote: "UP" | "DOWN" | null;
};

type PollPayload = {
  newsRequest: {
    id: string;
    status: "pending" | "failed" | "success";
    error: string | null;
    date: string;
    scope: string;
    location: string | null;
  };
  stories: NewsStory[];
};

const POLL_MS = 3000;

export default function NewsResultPage() {
  const params = useParams<{ newsId: string }>();
  const newsId = params.newsId;
  const [data, setData] = useState<PollPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [deepDiveStoryId, setDeepDiveStoryId] = useState<string | null>(null);
  const [deepDiveError, setDeepDiveError] = useState<string | null>(null);
  const [votingStoryId, setVotingStoryId] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  const router = useRouter();

  const fetchStatus = useCallback(async () => {
    const response = await fetch(`/api/news/${newsId}`);
    const payload = (await response.json()) as PollPayload & { error?: string };

    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to load news request");
    }

    setData(payload);
    return payload;
  }, [newsId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const payload = await fetchStatus();
        if (cancelled) {
          return;
        }
        if (payload.newsRequest.status === "pending") {
          timer = setTimeout(poll, POLL_MS);
        }
      } catch (pollError) {
        if (!cancelled) {
          setError(
            pollError instanceof Error ? pollError.message : "Polling failed",
          );
        }
      }
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [fetchStatus]);

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
    setError(null);
    try {
      const response = await fetch(`/api/news/${newsId}`, { method: "POST" });
      const payload = (await response.json()) as PollPayload & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Retry failed");
      }
      setData(payload);
    } catch (retryError) {
      setError(
        retryError instanceof Error ? retryError.message : "Retry failed",
      );
    } finally {
      setRetrying(false);
    }
  }

  const status = data?.newsRequest.status;

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
          News results
        </h1>
        {data?.newsRequest ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {data.newsRequest.date} · {data.newsRequest.scope}
            {data.newsRequest.location ? ` · ${data.newsRequest.location}` : ""}
          </p>
        ) : null}
      </div>

      {!data && !error ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {deepDiveError ? (
        <p className="text-sm text-red-600">{deepDiveError}</p>
      ) : null}
      {voteError ? <p className="text-sm text-red-600">{voteError}</p> : null}

      {status === "pending" ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Pipeline running… refreshing every {POLL_MS / 1000}s.
        </p>
      ) : null}

      {status === "failed" ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm">
          <p className="font-medium text-red-800">Pipeline failed</p>
          <p className="mt-1 text-red-700">
            {data?.newsRequest.error ?? "Unknown error"}
          </p>
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
          >
            {retrying ? "Retrying…" : "Retry"}
          </button>
        </div>
      ) : null}

      {status === "success" && data?.stories.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No stories were generated.
        </p>
      ) : null}

      <ul className="flex flex-col gap-4">
        {data?.stories.map((story) => (
          <li key={story.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{story.category}</span>
              {story.importanceScore != null ? (
                <span>Score {story.importanceScore}</span>
              ) : null}
            </div>
            <div className="mt-1 flex items-start gap-2">
              <h2 className="min-w-0 flex-1 text-lg font-semibold">
                {story.title}
              </h2>
              <StorySourceLinks sources={story.sourceUrls ?? []} />
            </div>
            <p className="mt-2 text-sm font-medium leading-relaxed">
              {story.summary}
            </p>
            {story.content?.trim() ? (
              <div className="mt-4 border-t pt-4">
                <ChatMarkdown
                  content={story.content}
                  className="text-foreground"
                />
              </div>
            ) : story.description ? (
              <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
                {story.description.split(/\n\n+/).map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            ) : null}
            {status === "success" ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={deepDiveStoryId === story.id}
                  onClick={() => onDeepDive(story.id)}
                >
                  {deepDiveStoryId === story.id ? "Starting…" : "Deep dive"}
                </Button>
                <StoryVoteControls
                  storyId={story.id}
                  vote={{
                    upvotes: story.upvotes ?? 0,
                    downvotes: story.downvotes ?? 0,
                    netVotes: story.netVotes ?? 0,
                    userVote: story.userVote ?? null,
                  }}
                  onVote={onStoryVote}
                  voting={votingStoryId === story.id}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
