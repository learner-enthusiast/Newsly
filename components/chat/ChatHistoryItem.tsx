"use client";

import type { ChatSessionSummary } from "@/services/chat/chatUiUtils";
import { cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";

type ChatHistoryItemProps = {
  session: ChatSessionSummary;
  active: boolean;
  onSelect: (id: string) => void;
};

export function ChatHistoryItem({
  session,
  active,
  onSelect,
}: ChatHistoryItemProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(session.id)}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
        active
          ? "bg-[#fde2d2]/70 font-medium text-foreground ring-1 ring-[#f0c4a8]/80"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      <MessageSquare className="mt-0.5 size-4 shrink-0 opacity-70" aria-hidden />
      <span className="line-clamp-2 min-w-0 flex-1">{session.title}</span>
    </button>
  );
}
