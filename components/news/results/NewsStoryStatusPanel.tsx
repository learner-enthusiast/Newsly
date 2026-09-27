"use client";

import {
  NEWS_STORY_LOADING_MESSAGES,
  ShimmerLoadingStatus,
} from "@/components/ui/shimmer-loading-status";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { SerializedNewsStory } from "@/services/news/newsRequestTypes";
import {
  shouldRenderFullStoryBody,
  shouldShowStoryEngagement,
} from "@/services/news/newsStoryPollingLogic";

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
  if (story.isGenerating) {
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

  if (story.generationFailed) {
    return (
      <Card className="border-destructive/30 bg-destructive/5 p-6">
        <Badge variant="outline" className="mb-3 border-destructive/40">
          Generation failed
        </Badge>
        <h1 className="text-xl font-semibold">We couldn’t finish this story</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          {story.generationError ??
            "The research pipeline hit an error. You can try asking again in chat."}
        </p>
      </Card>
    );
  }

  return null;
}

export { shouldRenderFullStoryBody, shouldShowStoryEngagement };
