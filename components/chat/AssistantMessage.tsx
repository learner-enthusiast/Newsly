"use client";

import { ChatMarkdown } from "@/components/chat/ChatMarkdown";
import { ChatNewsCard } from "@/components/chat/ChatNewsCard";
import { KeyTakeaways } from "@/components/chat/KeyTakeaways";
import { PerspectiveCards } from "@/components/chat/PerspectiveCards";
import { formatMessageTimestamp } from "@/services/chat/chatUiUtils";
import { parseAssistantMessage } from "@/services/chat/parseAssistantMessage";
import { cn } from "@/lib/utils";
import { ChatStoryCreationCard } from "@/components/chat/ChatStoryCreationCard";
import {
  resolveResearchSourceImageUrl,
  type ResearchSourceImageLookup,
} from "@/services/chat/chatResearchSourceImages";
import type { ChatStoryCreationPayload } from "@/services/news/newsRequestTypes";
import { Bot } from "lucide-react";

type AssistantMessageProps = {
  content: string;
  createdAt: string;
  storyCreation?: ChatStoryCreationPayload | null;
  researchSourceImages?: ResearchSourceImageLookup;
  className?: string;
};

export function AssistantMessage({
  content,
  createdAt,
  storyCreation = null,
  researchSourceImages = {},
  className,
}: AssistantMessageProps) {
  const parsed = parseAssistantMessage(content);
  const timestamp = formatMessageTimestamp(createdAt);
  const cardLinks = parsed.links.slice(0, 4);

  return (
    <div
      className={cn("flex w-full justify-start gap-3", className)}
      data-chat-message="assistant"
    >
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#fde2d2] text-[#c85d3f]"
        aria-hidden
      >
        <Bot className="size-4" />
      </span>
      <div className="min-w-0 max-w-[min(100%,42rem)] flex-1 space-y-3">
        <div className="rounded-2xl rounded-bl-md border border-border/60 bg-card/95 px-4 py-3 text-sm leading-relaxed shadow-paper">
          {parsed.bodyMarkdown ? (
            <ChatMarkdown content={parsed.bodyMarkdown} className="text-foreground" />
          ) : (
            <ChatMarkdown content={content} className="text-foreground" />
          )}
        </div>

        {storyCreation ? (
          <ChatStoryCreationCard storyCreation={storyCreation} />
        ) : null}

        {cardLinks.length > 0 ? (
          <div className="flex flex-wrap gap-3" data-chat-news-cards>
            {cardLinks.map((link) => (
              <ChatNewsCard
                key={link.url}
                link={link}
                imageUrl={resolveResearchSourceImageUrl(
                  link.url,
                  researchSourceImages,
                )}
              />
            ))}
          </div>
        ) : null}

        <KeyTakeaways items={parsed.takeaways} />
        <PerspectiveCards perspectives={parsed.perspectives} />

        {parsed.links.length > 0 ? (
          <div className="rounded-lg border border-border/50 bg-muted/25 px-3 py-2 text-xs">
            <p className="font-medium text-foreground">Sources</p>
            <ul className="mt-1 space-y-1 text-muted-foreground">
              {parsed.links.slice(0, 8).map((link) => (
                <li key={link.url}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-foreground hover:underline"
                  >
                    {link.title}
                    {link.domain ? ` · ${link.domain}` : ""}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {timestamp ? (
          <p className="text-[11px] text-muted-foreground">{timestamp}</p>
        ) : null}
      </div>
    </div>
  );
}
