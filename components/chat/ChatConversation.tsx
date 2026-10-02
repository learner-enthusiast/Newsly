"use client";

import { ChatDeepDiveBanner } from "@/components/chat/ChatDeepDiveBanner";
import { ChatResearchProgressPanel } from "@/components/chat/ChatResearchProgressPanel";
import { ChatVirtualizedMessageList } from "@/components/chat/ChatVirtualizedMessageList";
import { ChatWelcome } from "@/components/chat/ChatWelcome";
import { isChatAssistantProgressPlaceholder } from "@/services/chat/chatAssistantProgress";
import { isAssistantRole } from "@/services/chat/chatUiUtils";
import type { SerializedChatMessageListItem } from "@/services/chat/chatMessagePagination";
import type { ResearchSourceImageLookup } from "@/services/chat/chatResearchSourceImages";
import type { ChatStoryCreationPayload } from "@/services/news/newsRequestTypes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type RefObject, useMemo } from "react";

export type ConversationMessage = SerializedChatMessageListItem;

type ChatConversationProps = {
  messages: ConversationMessage[];
  scrollRef: RefObject<HTMLElement | null>;
  loadingInitial: boolean;
  loadingOlder: boolean;
  hasMoreOlder: boolean;
  olderError: string | null;
  onLoadOlder: () => void;
  onRetryOlder: () => void;
  sessionScrollKey: string;
  onAtBottomChange?: (atBottom: boolean) => void;
  bindScrollToBottom?: (scrollToBottom: () => void) => void;
  status: "initializing" | "ready" | "failed";
  showWelcome: boolean;
  storyTitle?: string | null;
  storyCreation?: ChatStoryCreationPayload | null;
  researchSourceImages?: ResearchSourceImageLookup;
  onPrompt: (prompt: string) => void;
  onRetry?: () => void;
  composerDisabled?: boolean;
};

export function ChatConversation({
  messages,
  scrollRef,
  loadingInitial,
  loadingOlder,
  hasMoreOlder,
  olderError,
  onLoadOlder,
  onRetryOlder,
  sessionScrollKey,
  onAtBottomChange,
  bindScrollToBottom,
  status,
  showWelcome,
  storyTitle,
  storyCreation,
  researchSourceImages,
  onPrompt,
  onRetry,
  composerDisabled,
}: ChatConversationProps) {
  const displayMessages = useMemo(
    () =>
      messages.filter(
        (message) =>
          !(
            isAssistantRole(message.role) &&
            isChatAssistantProgressPlaceholder(message.content)
          ),
      ),
    [messages],
  );

  if (showWelcome && messages.length === 0 && !loadingInitial) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
        {storyTitle ? <ChatDeepDiveBanner title={storyTitle} /> : null}
        <ChatWelcome onPrompt={onPrompt} disabled={composerDisabled} />
      </div>
    );
  }

  const header = storyTitle ? <ChatDeepDiveBanner title={storyTitle} /> : null;

  const footer = (
    <>
      <ChatResearchProgressPanel messages={messages} status={status} />

      {status === "failed" ? (
        <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p>Something went wrong while researching this.</p>
          {onRetry ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={onRetry}
            >
              Try again
            </Button>
          ) : null}
        </Card>
      ) : null}
    </>
  );

  return (
    <ChatVirtualizedMessageList
      messages={displayMessages}
      scrollRef={scrollRef}
      loadingInitial={loadingInitial}
      loadingOlder={loadingOlder}
      hasMoreOlder={hasMoreOlder}
      olderError={olderError}
      onLoadOlder={onLoadOlder}
      onRetryOlder={onRetryOlder}
      header={header}
      footer={footer}
      sessionScrollKey={sessionScrollKey}
      onAtBottomChange={onAtBottomChange}
      bindScrollToBottom={bindScrollToBottom}
      storyCreation={storyCreation}
      researchSourceImages={researchSourceImages}
    />
  );
}
