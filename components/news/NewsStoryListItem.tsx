"use client";

import { ChatMarkdown } from "@/components/chat/ChatMarkdown";
import {
  StoryVoteControls,
  type StoryVoteState,
} from "@/components/news/StoryVoteControls";
import {
  StorySourceLinks,
  type StorySourceLink,
} from "@/components/news/StorySourceLinks";
import { Button } from "@/components/ui/button";

export type NewsStoryListItemData = {
  id: string;
  title: string;
  summary: string;
  description: string | null;
  content: string;
  category: string;
  location: string | null;
  publishedAt: string | null;
  importanceScore: number | null;
  sourceUrls: StorySourceLink[];
  upvotes: number;
  downvotes: number;
  netVotes: number;
  userVote: StoryVoteState["userVote"];
};

type NewsStoryListItemProps = {
  story: NewsStoryListItemData;
  showActions: boolean;
  deepDiveStoryId: string | null;
  votingStoryId: string | null;
  onDeepDive: (storyId: string) => void;
  onVote: (storyId: string, vote: "UP" | "DOWN") => Promise<void>;
};

function formatPublishedAt(iso: string | null): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function NewsStoryListItem({
  story,
  showActions,
  deepDiveStoryId,
  votingStoryId,
  onDeepDive,
  onVote,
}: NewsStoryListItemProps) {
  const publishedLabel = formatPublishedAt(story.publishedAt);

  return (
    <li className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{story.category}</span>
        {story.location ? <span>{story.location}</span> : null}
        {publishedLabel ? <span>Published {publishedLabel}</span> : null}
        {story.importanceScore != null ? (
          <span>Score {story.importanceScore}</span>
        ) : null}
      </div>
      <div className="mt-1 flex items-start gap-2">
        <h2 className="min-w-0 flex-1 text-lg font-semibold">{story.title}</h2>
        <StorySourceLinks sources={story.sourceUrls ?? []} />
      </div>
      <p className="mt-2 text-sm font-medium leading-relaxed">{story.summary}</p>
      {story.content?.trim() ? (
        <div className="mt-4 border-t pt-4">
          <ChatMarkdown content={story.content} className="text-foreground" />
        </div>
      ) : story.description ? (
        <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
          {story.description.split(/\n\n+/).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      ) : null}
      {showActions ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={deepDiveStoryId === story.id}
            onClick={() => onDeepDive(story.id)}
          >
            {deepDiveStoryId === story.id ? "Starting…" : "Deep dive"}
          </Button>
          <StoryVoteControls
            storyId={story.id}
            vote={{
              upvotes: story.upvotes ?? 0,
              downvotes: story.downvotes ?? 0,
              netVotes: story.netVotes ?? 0,
              userVote: story.userVote ?? null,
            }}
            onVote={onVote}
            voting={votingStoryId === story.id}
          />
        </div>
      ) : null}
    </li>
  );
}
