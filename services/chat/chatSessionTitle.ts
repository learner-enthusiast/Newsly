const DEFAULT_USER_CHAT_TITLES = new Set(
  ["new chat", "untitled chat", "chat"].map((s) => s.toLowerCase()),
);

export const CHAT_SESSION_TITLE_MAX_LENGTH = 80;

/** True when the session still has a placeholder title (user general chat). */
export function shouldAutoRenameUserChatTitle(title: string | null | undefined): boolean {
  if (title == null || title.trim() === "") {
    return true;
  }
  return DEFAULT_USER_CHAT_TITLES.has(title.trim().toLowerCase());
}

/** Build a sidebar-safe title from the first user message. */
export function chatTitleFromFirstUserMessage(content: string): string {
  const singleLine = content.replace(/\s+/g, " ").trim();
  if (!singleLine) {
    return "New chat";
  }
  if (singleLine.length <= CHAT_SESSION_TITLE_MAX_LENGTH) {
    return singleLine;
  }
  return `${singleLine.slice(0, CHAT_SESSION_TITLE_MAX_LENGTH - 1).trimEnd()}…`;
}
