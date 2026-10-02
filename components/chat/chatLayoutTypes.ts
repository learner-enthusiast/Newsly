import type { ChatStoryCreationPayload } from "@/services/news/newsRequestTypes";

export type ChatLayoutState = {
  chatSessionId: string;
  status: "initializing" | "ready" | "failed";
  storyCreation: ChatStoryCreationPayload | null;
  chatSession: {
    id: string;
    title: string | null;
    newsStoryId: string | null;
    isFromNewsStory: boolean;
  };
};
