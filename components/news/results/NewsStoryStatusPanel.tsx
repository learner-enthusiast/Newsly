"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { SerializedNewsStory } from "@/services/news/newsRequestTypes";
import {
  shouldRenderFullStoryBody,
  shouldShowStoryEngagement,
} from "@/services/news/newsStoryPollingLogic";

type NewsStoryStatusPanelProps = {
  story: SerializedNewsStory;
};

export function NewsStoryStatusPanel({ story }: NewsStoryStatusPanelProps) {
  if (story.isGenerating) {
    return null;
  }

  if (story.generationFailed) {
    return (
      <Card className="border-destructive/30 bg-destructive/5 p-6">
        <Badge variant="outline" className="mb-3 border-destructive/40">
          Generation failed
        </Badge>
        <h1 className="text-xl font-semibold">We couldn’t finish this story</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          {story.generationError ??
            "The research pipeline hit an error. You can try asking again in chat."}
        </p>
      </Card>
    );
  }

  return null;
}

export { shouldRenderFullStoryBody, shouldShowStoryEngagement };
