"use client";

import {
  NEWS_STORY_LOADING_MESSAGES,
  ShimmerLoadingStatus,
} from "@/components/ui/shimmer-loading-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { SerializedNewsStory } from "@/services/news/newsRequestTypes";
import Link from "next/link";

const STORY_GENERATION_MESSAGES = [
  "Researching sources for your story…",
  "Gathering evidence from the web…",
  "Checking transcripts and articles…",
  "Synthesizing your news story…",
  "Almost ready for review…",
] as const;

type NewsStoryStatusPanelProps = {
  story: SerializedNewsStory;
  pollWarning?: string | null;
};

export function NewsStoryStatusPanel({
  story,
  pollWarning,
}: NewsStoryStatusPanelProps) {
  if (story.status === "PENDING") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Badge variant="secondary">Preparing story</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">
            Your story is being researched
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            We’re collecting sources and writing the article. This page updates
            automatically—no need to keep this tab focused.
          </p>
          {pollWarning ? (
            <p className="text-xs text-muted-foreground">{pollWarning}</p>
          ) : null}
        </div>
        <ShimmerLoadingStatus
          messages={STORY_GENERATION_MESSAGES}
          statusLabel="Generating story"
          className="min-h-[32vh] rounded-xl border border-border/60"
        />
      </div>
    );
  }

  if (story.status === "FAILED") {
    return (
      <Card className="border-destructive/30 bg-destructive/5 p-6">
        <Badge variant="outline" className="mb-3 border-destructive/40">
          Generation failed
        </Badge>
        <h1 className="text-xl font-semibold">We couldn’t finish this story</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          The research pipeline hit an error. You can try asking again in chat,
          or check notifications for updates when retry is available.
        </p>
      </Card>
    );
  }

  if (story.status === "ARCHIVED") {
    return (
      <Card className="border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
        This story has been archived and is no longer actively published.
      </Card>
    );
  }

  if (story.status === "DRAFT") {
    return (
      <Card className="border-border/60 bg-muted/20 p-4 text-sm">
        <Badge variant="outline" className="mb-2">
          Draft
        </Badge>
        <p className="text-muted-foreground">
          This is a saved draft. Publish when you’re ready to share it publicly.
        </p>
      </Card>
    );
  }

  if (story.status === "READY") {
    return (
      <Card className="border-primary/20 bg-primary/5 p-4 text-sm">
        <Badge variant="outline" className="mb-2">
          Ready for review
        </Badge>
        <p className="text-muted-foreground">
          AI generation finished. This story is not published yet—review the
          content below and use your usual save or publish flow when available.
        </p>
        {story.creator === "USER" ? (
          <Button
            type="button"
            variant="link"
            className="mt-2 h-auto p-0"
            nativeButton={false}
            render={<Link href="/chat" />}
          >
            Back to chat
          </Button>
        ) : null}
      </Card>
    );
  }

  return null;
}

export function shouldRenderFullStoryBody(story: SerializedNewsStory): boolean {
  return story.status !== "PENDING" && story.status !== "FAILED";
}

export function shouldShowStoryEngagement(story: SerializedNewsStory): boolean {
  return story.status !== "PENDING" && story.status !== "FAILED";
}
