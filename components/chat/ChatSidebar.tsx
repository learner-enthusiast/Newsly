"use client";

import { ChatHistoryItem } from "@/components/chat/ChatHistoryItem";
import {
  groupChatSessionsByDate,
  type ChatSessionSummary,
} from "@/services/chat/chatUiUtils";
import { Button } from "@/components/ui/button";
import { Loader2, MessageSquarePlus } from "lucide-react";

type ChatSidebarProps = {
  sessions: ChatSessionSummary[];
  activeId: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  creatingChat?: boolean;
};

export function ChatSidebar({
  sessions,
  activeId,
  onSelect,
  onNewChat,
  creatingChat = false,
}: ChatSidebarProps) {
  const groups = groupChatSessionsByDate(sessions);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-3">
        <Button
          type="button"
          variant="brand-accent"
          size="sm"
          className="w-full justify-center"
          disabled={creatingChat}
          onClick={onNewChat}
        >
          {creatingChat ? (
            <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
          ) : (
            <MessageSquarePlus data-icon="inline-start" />
          )}
          New Chat
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {groups.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            No chats yet. Start a new conversation.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="px-2 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {group.label}
              </p>
              <ul className="flex flex-col gap-1">
                {group.sessions.map((session) => (
                  <li key={session.id}>
                    <ChatHistoryItem
                      session={session}
                      active={session.id === activeId}
                      onSelect={onSelect}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
