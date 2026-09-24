import { listRecentChatMessagesByChatSessionId } from "@/repositories/chatMessage";

/** Matches query enhancer / small determiner recent-turn limit. */
export const CHAT_PIPELINE_RECENT_MESSAGE_LIMIT = 10;

export type PipelineRecentChatMessage = {
  role: string;
  content: string;
};

/**
 * Last N chat turns for query enhancement and determiner context.
 * Optionally excludes the current user message (fetches one extra row when needed).
 */
export async function loadRecentMessagesForQueryEnhancer(
  chatSessionId: string,
  excludeMessageId?: string,
): Promise<PipelineRecentChatMessage[]> {
  const fetchLimit = excludeMessageId
    ? CHAT_PIPELINE_RECENT_MESSAGE_LIMIT + 1
    : CHAT_PIPELINE_RECENT_MESSAGE_LIMIT;

  const rows = await listRecentChatMessagesByChatSessionId(
    chatSessionId,
    fetchLimit,
  );

  const filtered = excludeMessageId
    ? rows.filter((row) => row.id !== excludeMessageId)
    : rows;

  return filtered.slice(-CHAT_PIPELINE_RECENT_MESSAGE_LIMIT).map((row) => ({
    role: row.role,
    content: row.content,
  }));
}
