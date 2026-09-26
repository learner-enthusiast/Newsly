export type ChatSessionSummary = {
  id: string;
  title: string;
  newsStoryId: string | null;
  isFromNewsStory: boolean;
  updatedAt: string;
};

export type ChatSessionGroup = {
  label: "Today" | "Yesterday" | "Last 7 Days" | "Older";
  sessions: ChatSessionSummary[];
};

function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function groupChatSessionsByDate(
  sessions: ChatSessionSummary[],
): ChatSessionGroup[] {
  const now = new Date();
  const todayStart = startOfLocalDay(now).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const weekStart = todayStart - 6 * 86_400_000;

  const buckets: Record<ChatSessionGroup["label"], ChatSessionSummary[]> = {
    Today: [],
    Yesterday: [],
    "Last 7 Days": [],
    Older: [],
  };

  for (const session of sessions) {
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

  return (["Today", "Yesterday", "Last 7 Days", "Older"] as const)
    .map((label) => ({ label, sessions: buckets[label] }))
    .filter((group) => group.sessions.length > 0);
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
