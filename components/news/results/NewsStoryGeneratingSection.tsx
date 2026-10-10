"use client";

import { NewsStoryGenerationProgressSidebar } from "@/components/news/results/NewsStoryGenerationProgressSidebar";
import { NewsStoryGenerationWaitPanel } from "@/components/news/results/NewsStoryGenerationWaitPanel";
import type { SerializedNewsStory } from "@/services/news/newsRequestTypes";

export type StoryGenerationProgressView = {
  percent: number;
  overdue: boolean;
  catchingUp: boolean;
  busy: boolean;
};

type NewsStoryGeneratingSectionProps = {
  story: SerializedNewsStory;
  progress: StoryGenerationProgressView;
  pollWarning?: string | null;
  layout: "main" | "sidebar";
};

export function NewsStoryGeneratingSection({
  story,
  progress,
  pollWarning,
  layout,
}: NewsStoryGeneratingSectionProps) {
  const loadingLogs =
    story.loadingLogs.length > 0
      ? story.loadingLogs
      : ["Story generation started."];

  if (layout === "sidebar") {
    return (
      <NewsStoryGenerationProgressSidebar
        loadingLogs={loadingLogs}
        percent={progress.percent}
        progressBusy={progress.busy}
      />
    );
  }

  return (
    <NewsStoryGenerationWaitPanel
      percent={progress.percent}
      overdue={progress.overdue}
      catchingUp={progress.catchingUp}
      progressBusy={progress.busy}
      pollWarning={pollWarning}
    />
  );
}

export function shouldShowStoryGenerationUi(
  story: Pick<SerializedNewsStory, "isGenerating">,
  progress: Pick<StoryGenerationProgressView, "catchingUp">,
): boolean {
  return story.isGenerating || progress.catchingUp;
}
