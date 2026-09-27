"use client";

import type { ChatSessionSummary } from "@/services/chat/chatUiUtils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  Bookmark,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";

type ChatHistoryItemProps = {
  session: ChatSessionSummary;
  active: boolean;
  onSelect: (id: string) => void;
  onRename?: (id: string, title: string) => void;
  onDelete?: (id: string) => void;
  onBookmark?: (id: string, isBookmarked: boolean) => void;
};

export function ChatHistoryItem({
  session,
  active,
  onSelect,
  onRename,
  onDelete,
  onBookmark,
}: ChatHistoryItemProps) {
  function handleRenameClick() {
    const next = window.prompt("Rename chat", session.title);
    if (next == null) {
      return;
    }
    const trimmed = next.trim();
    if (!trimmed || trimmed === session.title) {
      return;
    }
    onRename?.(session.id, trimmed);
  }

  function handleDeleteClick() {
    const ok = window.confirm(`Delete "${session.title}"? This cannot be undone.`);
    if (!ok) {
      return;
    }
    onDelete?.(session.id);
  }

  return (
    <div
      className={cn(
        "group flex w-full items-stretch gap-0.5 rounded-xl",
        active && "bg-[#fde2d2]/70 ring-1 ring-[#f0c4a8]/80",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(session.id)}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex min-w-0 flex-1 items-start gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
          active
            ? "font-medium text-foreground"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        )}
      >
        {session.isBookmarked ? (
          <Bookmark
            className="mt-0.5 size-4 shrink-0 fill-accent text-accent"
            aria-hidden
          />
        ) : (
          <MessageSquare className="mt-0.5 size-4 shrink-0 opacity-70" aria-hidden />
        )}
        <span className="line-clamp-2 min-w-0 flex-1">{session.title}</span>
      </button>
      {onRename || onDelete || onBookmark ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="my-1.5 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-popup-open:opacity-100"
                aria-label={`Chat options for ${session.title}`}
                onClick={(event) => event.stopPropagation()}
              />
            }
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {onBookmark ? (
              <DropdownMenuItem
                onClick={() =>
                  onBookmark(session.id, !session.isBookmarked)
                }
              >
                <Bookmark className="size-4" />
                {session.isBookmarked ? "Remove bookmark" : "Bookmark"}
              </DropdownMenuItem>
            ) : null}
            {onRename ? (
              <DropdownMenuItem onClick={handleRenameClick}>
                <Pencil className="size-4" />
                Rename
              </DropdownMenuItem>
            ) : null}
            {onDelete ? (
              <DropdownMenuItem
                variant="destructive"
                onClick={handleDeleteClick}
              >
                <Trash2 className="size-4" />
                Delete
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
