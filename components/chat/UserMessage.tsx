"use client";

import { formatMessageTimestamp } from "@/services/chat/chatUiUtils";
import { cn } from "@/lib/utils";

type UserMessageProps = {
  content: string;
  createdAt: string;
  className?: string;
  pending?: boolean;
};

export function UserMessage({
  content,
  createdAt,
  className,
  pending = false,
}: UserMessageProps) {
  const timestamp = formatMessageTimestamp(createdAt);

  return (
    <div className={cn("flex w-full justify-end", className)} data-chat-message="user">
      <div className="max-w-[min(100%,36rem)] space-y-1">
        <div
          className={cn(
            "rounded-2xl rounded-br-md bg-[#c85d3f] px-4 py-3 text-sm leading-relaxed text-white shadow-paper",
            pending && "opacity-85",
          )}
        >
          <p className="whitespace-pre-wrap">{content}</p>
        </div>
        {pending ? (
          <p className="text-right text-[11px] text-muted-foreground">Sending…</p>
        ) : timestamp ? (
          <p className="text-right text-[11px] text-muted-foreground">{timestamp}</p>
        ) : null}
      </div>
    </div>
  );
}
