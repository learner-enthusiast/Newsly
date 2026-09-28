"use client";

import { NewsStoryDetailView } from "@/components/news/results/NewsStoryDetailView";
import {
  NEWS_STORY_LOADING_MESSAGES,
  ShimmerLoadingStatus,
} from "@/components/ui/shimmer-loading-status";
import type { StoryVoteState } from "@/components/news/StoryVoteControls";
import { useNewsStoryPolling } from "@/hooks/useNewsStoryPolling";
import type { NewsStoryPagePayload } from "@/services/news/newsRequestTypes";
import {
  applyCounterDelta,
  buildNewsStoryVoteSummary,
  resolveVoteCounterDelta,
  resolveVoteMutation,
} from "@/services/news/storyVoteLogic";
import { useAuth } from "@clerk/nextjs";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

const storyPageMainClassName =
  "min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-background";

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

  const voteLockRef = useRef<Set<string>>(new Set());
  const saveLockRef = useRef<Set<string>>(new Set());

  const {
    data,
    setData,
    error: loadError,
    pollWarning,
    isLoading,
  } = useNewsStoryPolling(storyId && isLoaded ? storyId : undefined);

  const error = loadError;
  const [deepDiveStoryId, setDeepDiveStoryId] = useState<string | null>(null);
  const [votingStoryId, setVotingStoryId] = useState<string | null>(null);
  const [savingStoryId, setSavingStoryId] = useState<string | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [photoUploadBusy, setPhotoUploadBusy] = useState(false);
  const photoUploadLockRef = useRef(false);

  const onPublish = useCallback(async () => {
    if (!storyId || !isSignedIn) {
      return;
    }
    setPublishBusy(true);
    try {
      const response = await fetch(`/api/news/stories/${storyId}/publish`, {
        method: "POST",
      });
      const payload = (await response.json()) as NewsStoryPagePayload & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to publish");
      }
      setData(payload);
      toast.success("Story published");
    } catch (publishErr) {
      toast.error(
        publishErr instanceof Error ? publishErr.message : "Publish failed",
      );
    } finally {
      setPublishBusy(false);
    }
  }, [isSignedIn, storyId, setData]);

  const onUnpublish = useCallback(async () => {
    if (!storyId || !isSignedIn) {
      return;
    }
    setPublishBusy(true);
    try {
      const response = await fetch(`/api/news/stories/${storyId}/publish`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as NewsStoryPagePayload & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to move to draft");
      }
      setData(payload);
      toast.success("Story moved to draft");
    } catch (unpublishErr) {
      toast.error(
        unpublishErr instanceof Error
          ? unpublishErr.message
          : "Could not move to draft",
      );
    } finally {
      setPublishBusy(false);
    }
  }, [isSignedIn, storyId, setData]);

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

  const onUploadStoryPhoto = useCallback(
    async (file: File) => {
      if (!storyId || !isSignedIn || photoUploadLockRef.current) {
        return;
      }
      photoUploadLockRef.current = true;

      const snapshotRef: { current: NewsStoryPagePayload | null } = {
        current: null,
      };
      const previewUrl = URL.createObjectURL(file);

      setData((current) => {
        snapshotRef.current = current;
        if (!current || current.story.id !== storyId) {
          return current;
        }
        return {
          ...current,
          story: { ...current.story, imageUrl: previewUrl },
        };
      });

      setPhotoUploadBusy(true);
      try {
        const formData = new FormData();
        formData.append("photo", file);

        const response = await fetch(`/api/news/stories/${storyId}/photo`, {
          method: "POST",
          body: formData,
        });
        const payload = (await response.json()) as {
          imageUrl?: string | null;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to upload photo");
        }

        URL.revokeObjectURL(previewUrl);
        setData((current) => {
          if (!current || current.story.id !== storyId) {
            return current;
          }
          const nextUrl =
            payload.imageUrl?.trim() || current.story.imageUrl?.trim() || null;
          if (nextUrl === current.story.imageUrl) {
            return current;
          }
          return {
            ...current,
            story: { ...current.story, imageUrl: nextUrl },
          };
        });
      } catch (uploadErr) {
        URL.revokeObjectURL(previewUrl);
        if (snapshotRef.current) {
          setData(snapshotRef.current);
        }
        toast.error(
          uploadErr instanceof Error ? uploadErr.message : "Photo upload failed",
        );
      } finally {
        photoUploadLockRef.current = false;
        setPhotoUploadBusy(false);
      }
    },
    [isSignedIn, storyId, setData],
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
      <main className={storyPageMainClassName}>
        <p className="px-4 py-8 text-sm text-destructive">Invalid story link.</p>
      </main>
    );
  }

  if (isLoading || !isLoaded) {
    return (
      <main className={storyPageMainClassName}>
        <ShimmerLoadingStatus
          messages={NEWS_STORY_LOADING_MESSAGES}
          statusLabel="Loading story"
          className="min-h-[40vh]"
        />
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className={storyPageMainClassName}>
        <p className="px-4 py-8 text-sm text-destructive" role="alert">
          {error ?? "Story not found."}
        </p>
      </main>
    );
  }

  return (
    <main className={storyPageMainClassName}>
      <NewsStoryDetailView
      data={data}
      pollWarning={pollWarning}
      isSignedIn={Boolean(isSignedIn)}
      showActions={Boolean(isSignedIn)}
      deepDiveStoryId={deepDiveStoryId}
      votingStoryId={votingStoryId}
      savingStoryId={savingStoryId}
      onDeepDive={onDeepDive}
      onVote={onStoryVote}
      onSaveToggle={onSaveToggle}
      onPublish={onPublish}
      onUnpublish={onUnpublish}
      publishBusy={publishBusy}
      photoUploadBusy={photoUploadBusy}
      onUploadStoryPhoto={onUploadStoryPhoto}
      onStoryUpdated={(payload) => setData(payload)}
      />
    </main>
  );
}
