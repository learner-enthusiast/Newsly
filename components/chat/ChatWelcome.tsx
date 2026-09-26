"use client";

import { CHAT_QUICK_PROMPTS } from "@/components/chat/chatConstants";
import { Button } from "@/components/ui/button";
import { Bot } from "lucide-react";

type ChatWelcomeProps = {
  onPrompt: (prompt: string) => void;
  disabled?: boolean;
};

export function ChatWelcome({ onPrompt, disabled = false }: ChatWelcomeProps) {
  return (
    <div
      data-chat-welcome
      className="rounded-2xl border border-border/60 bg-card/80 p-6 shadow-paper sm:p-8"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span
          className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#fde2d2]/80 text-[#c85d3f]"
          aria-hidden
        >
          <Bot className="size-7" />
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <h2 className="font-display text-2xl font-semibold leading-tight">
            Hi! I&apos;m your News Assistant
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
            Ask questions about today&apos;s news, get summaries, explore topics,
            compare perspectives, or dive deeper into stories.
          </p>
          <ul className="text-sm text-muted-foreground">
            <li>• Summarize stories</li>
            <li>• Explain complex topics</li>
            <li>• Compare developments</li>
            <li>• Research specific events</li>
            <li>• Explore sources</li>
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            {CHAT_QUICK_PROMPTS.map((prompt) => (
              <Button
                key={prompt}
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full bg-background/80"
                disabled={disabled}
                onClick={() => onPrompt(prompt)}
              >
                {prompt}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
