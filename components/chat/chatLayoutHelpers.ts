import type { SerializedChatMessageListItem } from "@/services/chat/chatMessagePagination";
import { hasAssistantReplyAfterLastUser } from "@/services/chat/chatUiUtils";
import type { ChatLayoutState } from "@/components/chat/chatLayoutTypes";
import { listStoryIdsAwaitingChatUpdate } from "@/services/chat/chatStoryRequestMessage";

export function isMessageResearchBlockingChat(input: {
  status: ChatLayoutState["status"] | undefined;
  storyCreation: ChatLayoutState["storyCreation"] | undefined;
  visibleMessages: SerializedChatMessageListItem[];
}): boolean {
  if (input.status !== "initializing") {
    return false;
  }
  if (input.storyCreation?.isGenerating) {
    return false;
  }
  return !hasAssistantReplyAfterLastUser(input.visibleMessages);
}

export function getComposerPlaceholder(
  hasState: boolean,
  messageResearchBlocking: boolean,
  visibleMessageCount: number,
): string {
  if (!hasState || messageResearchBlocking) {
    return "Waiting for the assistant reply…";
  }
  if (visibleMessageCount === 0) {
    return "Ask anything about the news…";
  }
  return "Ask a follow-up…";
}

export function getPotentialStoryTopicsFetchKey(input: {
  status: ChatLayoutState["status"] | undefined;
  storyCreation: ChatLayoutState["storyCreation"] | undefined;
  visibleMessages: SerializedChatMessageListItem[];
  suggestionsRefreshKey: string;
}): string | null {
  if (input.status !== "ready") {
    return null;
  }
  if (input.storyCreation?.isGenerating) {
    return null;
  }
  if (!hasAssistantReplyAfterLastUser(input.visibleMessages)) {
    return null;
  }
  if (input.suggestionsRefreshKey === "no-assistant-yet") {
    return null;
  }
  return input.suggestionsRefreshKey;
}

export function shouldScheduleChatPoll(
  payload: Pick<ChatLayoutState, "status" | "storyCreation">,
  messages: SerializedChatMessageListItem[] = [],
): boolean {
  return (
    payload.status === "initializing" ||
    payload.storyCreation?.isGenerating === true ||
    listStoryIdsAwaitingChatUpdate(messages).length > 0
  );
}
