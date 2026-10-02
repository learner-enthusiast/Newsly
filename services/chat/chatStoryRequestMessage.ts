import type { ChatStoryCreationPayload } from "@/services/news/newsRequestTypes";

export const CHAT_STORY_REQUEST_PENDING_CONTENT =
  "I'm researching and writing your news story. You'll be notified when it's ready to review.";

export function buildChatStoryRequestReadyMessage(input: {
  storyId: string;
  title: string;
}): string {
  const href = `/newsStory/${input.storyId}`;
  const title = input.title.trim() || "Your story";
  return `Here's your story: [${title}](${href}) — open it to review and publish when you're ready.`;
}

export function buildChatStoryRequestFailedMessage(storyId: string): string {
  const href = `/newsStory/${storyId}`;
  return `We couldn't finish your story. You can [view details and retry from chat](${href}), or keep researching here.`;
}

export function isChatStoryRequestPendingContent(content: string): boolean {
  return content.trim() === CHAT_STORY_REQUEST_PENDING_CONTENT;
}

export function messageNeedsStoryStatusPoll(message: {
  isAStoryRequest: boolean;
  newsStoryId: string | null;
  content: string;
}): boolean {
  return (
    message.isAStoryRequest &&
    message.newsStoryId != null &&
    message.newsStoryId.length > 0 &&
    isChatStoryRequestPendingContent(message.content)
  );
}

export function listStoryIdsAwaitingChatUpdate(
  messages: Array<{
    isAStoryRequest: boolean;
    newsStoryId: string | null;
    content: string;
  }>,
): string[] {
  const ids = new Set<string>();
  for (const message of messages) {
    if (messageNeedsStoryStatusPoll(message) && message.newsStoryId) {
      ids.add(message.newsStoryId);
    }
  }
  return [...ids];
}

export function deriveStoryCreationPayloadForMessage(
  message: {
    isAStoryRequest: boolean;
    newsStoryId: string | null;
    content: string;
  },
  liveStoryCreation: ChatStoryCreationPayload | null | undefined,
): ChatStoryCreationPayload | null {
  if (!message.isAStoryRequest || !message.newsStoryId) {
    return null;
  }

  if (liveStoryCreation?.storyId === message.newsStoryId) {
    return liveStoryCreation;
  }

  const storyId = message.newsStoryId;
  const base = {
    storyId,
    isUserCreated: true as const,
    publishStatus: "draft" as const,
  };

  if (isChatStoryRequestPendingContent(message.content)) {
    return {
      ...base,
      isGenerating: true,
      generationFailed: false,
    };
  }

  if (message.content.includes("couldn't finish your story")) {
    return {
      ...base,
      isGenerating: false,
      generationFailed: true,
    };
  }

  return {
    ...base,
    isGenerating: false,
    generationFailed: false,
  };
}
