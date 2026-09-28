import type { ChatStoryCreationPayload } from "@/services/news/newsRequestTypes";
import type { PublishStatus } from "@/services/news/newsRequestTypes";
import {
  isUserStoryGenerationFailed,
  isUserStoryGenerating,
} from "@/services/news/newsStoryAccess";

export function toChatStoryCreationPayload(story: {
  id: string;
  publishStatus: PublishStatus;
  slug: string;
  title: string;
  generationError: string | null;
}): ChatStoryCreationPayload {
  return {
    storyId: story.id,
    isUserCreated: true,
    publishStatus: story.publishStatus,
    isGenerating: isUserStoryGenerating(story),
    generationFailed: isUserStoryGenerationFailed(story),
  };
}
