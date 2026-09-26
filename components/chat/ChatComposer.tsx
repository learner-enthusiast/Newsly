"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, Loader2, Paperclip } from "lucide-react";

type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  sending?: boolean;
  placeholder?: string;
};

export function ChatComposer({
  value,
  onChange,
  onSend,
  disabled = false,
  sending = false,
  placeholder = "Ask anything about the news…",
}: ChatComposerProps) {
  const canSend = !disabled && !sending && value.trim().length > 0;

  return (
    <div className="border-t border-border/40 bg-background/95 p-3 backdrop-blur sm:p-4">
      <div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-2xl border border-border/60 bg-card px-3 py-2 shadow-paper">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled
          aria-label="Attach file (coming soon)"
          className="shrink-0 self-center"
        >
          <Paperclip className="size-4" aria-hidden />
        </Button>
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled || sending}
          rows={1}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canSend) {
                onSend();
              }
            }
          }}
          className="max-h-40 min-h-[44px] flex-1 resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          aria-label="Message"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled
          aria-label="Voice input (coming soon)"
          className="shrink-0 self-center"
        >
          <span aria-hidden>🎤</span>
        </Button>
        <Button
          type="button"
          size="icon"
          variant="brand-accent"
          className="shrink-0 rounded-full"
          disabled={!canSend}
          aria-label="Send message"
          onClick={onSend}
        >
          {sending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <ArrowUp className="size-4" aria-hidden />
          )}
        </Button>
      </div>
    </div>
  );
}
