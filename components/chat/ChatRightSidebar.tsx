"use client";

import { CHAT_DEMO_TRENDING_TOPICS } from "@/components/chat/chatConstants";
import { animateSuggestionRefresh } from "@/components/chat/useChatMotion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useLayoutEffect, useRef } from "react";

type ChatPromptOptions = { shouldCreateStory?: boolean };

type ChatRightSidebarProps = {
  potentialStoryTopics?: string[];
  potentialTopicsLoading?: boolean;
  actions: string[];
  questions: string[];
  isRefreshing?: boolean;
  animationGeneration?: number;
  onPrompt: (prompt: string, options?: ChatPromptOptions) => void;
  disabled?: boolean;
};

export function ChatRightSidebar({
  potentialStoryTopics = [],
  potentialTopicsLoading = false,
  actions,
  questions,
  isRefreshing = false,
  animationGeneration = 0,
  onPrompt,
  disabled,
}: ChatRightSidebarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hasAnimatedInitialRef = useRef(false);

  useLayoutEffect(() => {
    if (animationGeneration === 0 && !hasAnimatedInitialRef.current) {
      return;
    }
    hasAnimatedInitialRef.current = true;
    animateSuggestionRefresh(rootRef.current);
  }, [animationGeneration, actions, questions]);

  return (
    <div ref={rootRef} className="flex flex-col gap-4 p-4 pb-6">
      <Card size="sm" className="border-border/60 bg-card/90">
        <CardHeader className="flex flex-row items-center justify-between border-b pb-3">
          <CardTitle className="text-sm">Potential story topics</CardTitle>
          {potentialTopicsLoading ? (
            <Loader2
              className="size-3.5 animate-spin text-muted-foreground"
              aria-label="Loading potential story topics"
            />
          ) : null}
        </CardHeader>
        <CardContent className="pt-3">
          {potentialStoryTopics.length === 0 ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {potentialTopicsLoading
                ? "Checking this chat for story ideas…"
                : "Story ideas appear here shortly after the assistant finishes a reply."}
            </p>
          ) : (
            <div
              className="max-h-[15rem] overflow-y-auto overscroll-y-contain pr-0.5"
              aria-label="Potential story topics list"
            >
              <ol className="space-y-2 text-sm">
                {potentialStoryTopics.map((topic, index) => (
                  <li key={`${index}-${topic}`}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto w-full justify-start gap-2 whitespace-normal py-1.5 text-left font-normal"
                      disabled={disabled}
                      onClick={() =>
                        onPrompt(`Create a story about: ${topic}`, {
                          shouldCreateStory: true,
                        })
                      }
                    >
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {index + 1}
                      </span>
                      <span>{topic}</span>
                    </Button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </CardContent>
      </Card>

      <Card
        size="sm"
        className={cn(
          "border-border/60 bg-card/90 transition-opacity duration-300",
          isRefreshing && "opacity-90",
        )}
      >
        <CardHeader className="flex flex-row items-center justify-between border-b pb-3">
          <CardTitle className="text-sm">Quick Actions</CardTitle>
          {isRefreshing ? (
            <Loader2
              className="size-3.5 animate-spin text-muted-foreground"
              aria-label="Updating quick actions"
            />
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-2 pt-3">
          {actions.map((action, index) => (
            <Button
              key={`${index}-${action}`}
              data-suggestion-item
              type="button"
              variant="outline"
              size="sm"
              className="h-auto justify-start whitespace-normal py-2 text-left"
              disabled={disabled}
              onClick={() => onPrompt(action)}
            >
              {action}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card
        size="sm"
        className={cn(
          "border-border/60 bg-card/90 transition-opacity duration-300",
          isRefreshing && "opacity-90",
        )}
      >
        <CardHeader className="flex flex-row items-center justify-between border-b pb-3">
          <CardTitle className="text-sm">Try These Questions</CardTitle>
          {isRefreshing ? (
            <Loader2
              className="size-3.5 animate-spin text-muted-foreground"
              aria-label="Updating suggested questions"
            />
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-1 pt-3">
          {questions.map((question, index) => (
            <Button
              key={`${index}-${question}`}
              data-suggestion-item
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto justify-start whitespace-normal py-1 text-left font-normal"
              disabled={disabled}
              onClick={() => onPrompt(question)}
            >
              {question}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card size="sm" className="border-border/60 bg-card/90">
        <CardHeader className="border-b pb-3">
          <CardTitle className="text-sm">Trending Topics</CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          <p className="mb-2 text-[11px] text-muted-foreground">
            Demo labels — connect to live trending data later.
          </p>
          <ol className="space-y-2 text-sm">
            {CHAT_DEMO_TRENDING_TOPICS.map((topic, index) => (
              <li key={topic} className="flex gap-2">
                <span className="tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <span>{topic}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
