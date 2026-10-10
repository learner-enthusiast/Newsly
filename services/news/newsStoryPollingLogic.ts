import type { SerializedNewsStory } from "@/services/news/newsRequestTypes";

export const NEWS_STORY_POLL_MS = 5000;

export function shouldPollNewsStory(story: Pick<
  SerializedNewsStory,
  "isGenerating" | "generationFailed"
> | undefined): boolean {
  if (!story) {
    return false;
  }
  return story.isGenerating && !story.generationFailed;
}

export function shouldRenderFullStoryBody(
  story: Pick<SerializedNewsStory, "isGenerating" | "generationFailed">,
): boolean {
  return !story.isGenerating && !story.generationFailed;
}

export function shouldShowStoryEngagement(
  story: Pick<
    SerializedNewsStory,
    "isGenerating" | "generationFailed"
  >,
): boolean {
  return !story.isGenerating && !story.generationFailed;
}
