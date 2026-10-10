/** In-flight agent row created at the start of `message-chat-research-pipeline`. */
export const CHAT_ASSISTANT_PROGRESS_PLACEHOLDER = "Research in progress…";

export function isChatAssistantProgressPlaceholder(content: string): boolean {
  return content.trim() === CHAT_ASSISTANT_PROGRESS_PLACEHOLDER;
}

export function isCompletedAssistantReplyContent(content: string): boolean {
  return !isChatAssistantProgressPlaceholder(content);
}
