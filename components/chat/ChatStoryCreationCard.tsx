"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ChatStoryCreationPayload } from "@/services/news/newsRequestTypes";
import { Loader2, Newspaper } from "lucide-react";
import Link from "next/link";

type ChatStoryCreationCardProps = {
  storyCreation: ChatStoryCreationPayload;
};

export function ChatStoryCreationCard({
  storyCreation,
}: ChatStoryCreationCardProps) {
  const href = `/newsStory/${storyCreation.storyId}`;
  const isPending = storyCreation.isGenerating;
  const isFailed = storyCreation.generationFailed;
  const isReady = !isPending && !isFailed;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Newspaper className="size-4" aria-hidden />
            )}
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">
              {isPending
                ? "Creating your story…"
                : isFailed
                  ? "Story generation failed"
                  : isReady
                    ? "Your story is ready to review"
                    : "Story update"}
            </p>
            <p className="text-xs text-muted-foreground">
              {isPending
                ? "We’re researching sources and writing your article. You can keep chatting or open the story page to follow progress."
                : isFailed
                  ? "Something went wrong while building this story. Open the story page for details."
                  : "Research and synthesis finished. Review the draft before publishing."}
            </p>
            <Badge variant="outline" className="text-[10px]">
              From your research
            </Badge>
          </div>
        </div>
        <Button
          type="button"
          variant={isFailed ? "outline" : "default"}
          size="sm"
          className="shrink-0"
          nativeButton={false}
          render={<Link href={href} />}
        >
          View story
        </Button>
      </CardContent>
    </Card>
  );
}
