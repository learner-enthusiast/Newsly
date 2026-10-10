import type { SerializedChatMessageListItem } from "@/services/chat/chatMessagePagination";
import { isChatAssistantProgressPlaceholder } from "@/services/chat/chatAssistantProgress";
import { isAssistantRole } from "@/services/chat/chatUiUtils";

export type ChatResearchJobView = {
  jobKey: string;
  startedAt: string;
  loadingLogs: string[];
};

export function resolveChatResearchJob(
  messages: SerializedChatMessageListItem[],
): ChatResearchJobView | null {
  let lastUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]!.role === "user") {
      lastUserIndex = index;
      break;
    }
  }
  if (lastUserIndex === -1) {
    return null;
  }

  const lastUser = messages[lastUserIndex]!;
  const agentsAfterUser = messages
    .slice(lastUserIndex + 1)
    .filter((message) => isAssistantRole(message.role));

  const placeholder = agentsAfterUser.find((message) =>
    isChatAssistantProgressPlaceholder(message.content),
  );

  if (placeholder) {
    return {
      jobKey: placeholder.id,
      startedAt: placeholder.createdAt,
      loadingLogs:
        placeholder.loadingLogs.length > 0
          ? placeholder.loadingLogs
          : ["Pipeline started."],
    };
  }

  const latestAgent = agentsAfterUser.at(-1);
  if (latestAgent) {
    return {
      jobKey: latestAgent.id,
      startedAt: latestAgent.createdAt,
      loadingLogs:
        latestAgent.loadingLogs.length > 0 ? latestAgent.loadingLogs : [],
    };
  }

  return {
    jobKey: `user-${lastUser.id}`,
    startedAt: lastUser.createdAt,
    loadingLogs: ["Research queued…"],
  };
}
