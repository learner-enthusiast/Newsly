"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ChatSessionStoryListItem } from "@/services/news/chatSessionStoriesService";
import { cn } from "@/lib/utils";
import { FileText, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type ChatSessionStoriesLauncherProps = {
  chatSessionId: string;
  refreshKey?: string | number;
};

export function ChatSessionStoriesLauncher({
  chatSessionId,
  refreshKey = 0,
}: ChatSessionStoriesLauncherProps) {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [stories, setStories] = useState<ChatSessionStoryListItem[]>([]);

  const loadCount = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/chat/${chatSessionId}/stories/count`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as { count?: number };
      setCount(typeof payload.count === "number" ? payload.count : 0);
    } catch {
      setCount(0);
    }
  }, [chatSessionId]);

  useEffect(() => {
    void loadCount();
  }, [loadCount, refreshKey]);

  async function openDialog() {
    setOpen(true);
    setLoadingList(true);
    try {
      const response = await fetch(`/api/chat/${chatSessionId}/stories`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        stories?: ChatSessionStoryListItem[];
        error?: string;
      };
      if (!response.ok) {
        setStories([]);
        return;
      }
      setStories(payload.stories ?? []);
    } catch {
      setStories([]);
    } finally {
      setLoadingList(false);
    }
  }

  function navigateToStory(storyId: string) {
    setOpen(false);
    router.push(`/newsStory/${storyId}`);
  }

  if (count <= 0) {
    return null;
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="relative shrink-0 self-center"
              aria-label={`${count} stor${count === 1 ? "y" : "ies"} from this chat`}
              onClick={() => void openDialog()}
            />
          }
        >
          <FileText className="size-4" aria-hidden />
          <Badge
            variant="secondary"
            className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full p-0 text-[10px] leading-none"
          >
            {count > 9 ? "9+" : count}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top">
          View stories you created in this chat
        </TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[min(85vh,640px)] gap-4 overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Stories from this chat</DialogTitle>
            <DialogDescription>
              Open a story to review or edit it on the story page.
            </DialogDescription>
          </DialogHeader>

          {loadingList ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              <span className="sr-only">Loading stories</span>
            </div>
          ) : stories.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              No stories found for this chat.
            </p>
          ) : (
            <ul className="max-h-[min(60vh,480px)] space-y-3 overflow-y-auto pr-1">
              {stories.map((story) => (
                <li key={story.id}>
                  <button
                    type="button"
                    onClick={() => navigateToStory(story.id)}
                    className={cn(
                      "flex w-full gap-3 rounded-xl border border-border/70 bg-card/90 p-3 text-left shadow-sm transition-colors",
                      "hover:border-primary/30 hover:bg-accent/20",
                    )}
                  >
                    <div
                      className={cn(
                        "relative h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-linear-to-br from-muted via-accent/25 to-secondary",
                        story.imageUrl && "bg-muted",
                      )}
                    >
                      {story.imageUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={story.imageUrl}
                          alt=""
                          className="size-full object-cover"
                          loading="lazy"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px]">
                          {story.publishStatus === "published"
                            ? "Published"
                            : story.isGenerating
                              ? "Generating"
                              : story.generationFailed
                                ? "Failed"
                                : "Draft"}
                        </Badge>
                        {story.category ? (
                          <span className="text-[10px] text-muted-foreground">
                            {story.category}
                          </span>
                        ) : null}
                      </div>
                      <p className="line-clamp-2 text-sm font-semibold leading-snug">
                        {story.title}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {story.description?.trim() ||
                          story.summary?.trim() ||
                          "No summary yet."}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
