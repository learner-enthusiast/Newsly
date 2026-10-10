import { isAssistantRole } from "@/services/chat/chatUiUtils";

/** Refetch UI suggestions when the latest assistant message changes. */
export function buildChatSuggestionsRefreshKey(
  messages: Array<{ id: string; role: string }>,
): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (isAssistantRole(message.role)) {
      return message.id;
    }
  }
  return "no-assistant-yet";
}
