"use client";

import { AssistantMessage } from "@/components/chat/AssistantMessage";
import { ChatDeepDiveBanner } from "@/components/chat/ChatDeepDiveBanner";
import { ChatLoading } from "@/components/chat/ChatLoading";
import { ChatWelcome } from "@/components/chat/ChatWelcome";
import { UserMessage } from "@/components/chat/UserMessage";
import {
  hasAssistantReplyAfterLastUser,
  isAssistantRole,
} from "@/services/chat/chatUiUtils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type ConversationMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

type ChatConversationProps = {
  messages: ConversationMessage[];
  status: "initializing" | "ready" | "failed";
  showWelcome: boolean;
  storyTitle?: string | null;
  onPrompt: (prompt: string) => void;
  onRetry?: () => void;
  composerDisabled?: boolean;
};

export function ChatConversation({
  messages,
  status,
  showWelcome,
  storyTitle,
  onPrompt,
  onRetry,
  composerDisabled,
}: ChatConversationProps) {
  const awaitingAssistantReply =
    status === "initializing" &&
    !hasAssistantReplyAfterLastUser(messages);

  const showResearching = awaitingAssistantReply;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      {storyTitle ? <ChatDeepDiveBanner title={storyTitle} /> : null}

      {showWelcome ? (
        <ChatWelcome onPrompt={onPrompt} disabled={composerDisabled} />
      ) : null}

      {messages.map((message) =>
        isAssistantRole(message.role) ? (
          <AssistantMessage
            key={message.id}
            content={message.content}
            createdAt={message.createdAt}
          />
        ) : (
          <UserMessage
            key={message.id}
            content={message.content}
            createdAt={message.createdAt}
          />
        ),
      )}

      {showResearching ? <ChatLoading variant="researching" /> : null}

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
    </div>
  );
}
