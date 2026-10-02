import type { ChatStoryCreationPayload } from "@/services/news/newsRequestTypes";
import type { ResearchSourceImageLookup } from "@/services/chat/chatResearchSourceImages";

export type ChatLayoutState = {
  chatSessionId: string;
  status: "initializing" | "ready" | "failed";
  storyCreation: ChatStoryCreationPayload | null;
  researchSourceImages: ResearchSourceImageLookup;
  chatSession: {
    id: string;
    title: string | null;
    newsStoryId: string | null;
    isFromNewsStory: boolean;
  };
};
