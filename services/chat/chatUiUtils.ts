export type ChatSessionSummary = {
  id: string;
  title: string;
  newsStoryId: string | null;
  isFromNewsStory: boolean;
  isBookmarked: boolean;
  updatedAt: string;
};

export type ChatSessionGroup = {
  label: "Bookmarked" | "Today" | "Yesterday" | "Last 7 Days" | "Older";
  sessions: ChatSessionSummary[];
};

function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function sortByUpdatedAtDesc(sessions: ChatSessionSummary[]): ChatSessionSummary[] {
  return [...sessions].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function groupChatSessionsByDate(
  sessions: ChatSessionSummary[],
): ChatSessionGroup[] {
  const now = new Date();
  const todayStart = startOfLocalDay(now).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const weekStart = todayStart - 6 * 86_400_000;

  const bookmarked = sortByUpdatedAtDesc(
    sessions.filter((session) => session.isBookmarked),
  );
  const rest = sessions.filter((session) => !session.isBookmarked);

  const buckets: Record<
    Exclude<ChatSessionGroup["label"], "Bookmarked">,
    ChatSessionSummary[]
  > = {
    Today: [],
    Yesterday: [],
    "Last 7 Days": [],
    Older: [],
  };

  for (const session of rest) {
    const updated = new Date(session.updatedAt).getTime();
    if (updated >= todayStart) {
      buckets.Today.push(session);
    } else if (updated >= yesterdayStart) {
      buckets.Yesterday.push(session);
    } else if (updated >= weekStart) {
      buckets["Last 7 Days"].push(session);
    } else {
      buckets.Older.push(session);
    }
  }

  const dateGroups = (
    ["Today", "Yesterday", "Last 7 Days", "Older"] as const
  )
    .map((label) => ({
      label,
      sessions: sortByUpdatedAtDesc(buckets[label]),
    }))
    .filter((group) => group.sessions.length > 0);

  if (bookmarked.length === 0) {
    return dateGroups;
  }

  return [{ label: "Bookmarked", sessions: bookmarked }, ...dateGroups];
}

export function formatMessageTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function isAssistantRole(role: string): boolean {
  return role === "agent" || role === "assistant";
}

export function hasAssistantReplyAfterLastUser(
  messages: { role: string }[],
): boolean {
  let lastUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]!.role === "user") {
      lastUserIndex = index;
      break;
    }
  }
  if (lastUserIndex === -1) {
    return false;
  }
  return messages
    .slice(lastUserIndex + 1)
    .some((message) => isAssistantRole(message.role));
}
