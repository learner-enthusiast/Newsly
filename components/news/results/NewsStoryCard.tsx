"use client";

import { ChatMarkdown } from "@/components/chat/ChatMarkdown";
import { NewsStorySources } from "@/components/news/results/NewsStorySources";
import { NewsStoryVotes } from "@/components/news/results/NewsStoryVotes";
import { NewsTakeaways } from "@/components/news/results/NewsTakeaways";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  formatStoryPublishedMeta,
  primaryStoryDomain,
} from "@/services/news/newsRequestDisplay";
import type { SerializedNewsStory } from "@/services/news/newsRequestTypes";
import { StorySaveButton } from "@/components/news/StorySaveButton";
import { cn } from "@/lib/utils";
import { SignInButton } from "@clerk/nextjs";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

type NewsStoryCardProps = {
  story: SerializedNewsStory;
  rank: number;
  showActions: boolean;
  /** Show action row for signed-out users (sign-in gated). */
  guestActionsVisible?: boolean;
  signInRedirectUrl?: string;
  deepDiveStoryId: string | null;
  votingStoryId: string | null;
  savingStoryId?: string | null;
  onDeepDive: (storyId: string) => void;
  onVote: (storyId: string, vote: "UP" | "DOWN") => Promise<void>;
  onSaveToggle?: (storyId: string, nextSaved: boolean) => Promise<void>;
  className?: string;
};

function categoryBadgeClass(category: string): string {
  const hash = [...category].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const variants = [
    "bg-accent/35 text-foreground border-accent/40",
    "bg-secondary text-secondary-foreground border-border/60",
    "bg-muted text-foreground border-border/50",
  ];
  return variants[hash % variants.length]!;
}

function signInRedirectForStory(
  storyId: string,
  explicit?: string,
): string {
  if (explicit) {
    return explicit;
  }
  if (typeof window !== "undefined") {
    return `${window.location.origin}/newsStory/${storyId}`;
  }
  return `/newsStory/${storyId}`;
}

export function NewsStoryCard({
  story,
  rank,
  showActions,
  guestActionsVisible = false,
  signInRedirectUrl,
  deepDiveStoryId,
  votingStoryId,
  savingStoryId = null,
  onDeepDive,
  onVote,
  onSaveToggle,
  className,
}: NewsStoryCardProps) {
  const domain = primaryStoryDomain(story.sourceUrls);
  const publishedMeta = formatStoryPublishedMeta(story.publishedAt, domain);
  const description = story.description?.trim() || story.summary?.trim() || "";
  const primarySourceTitle = story.sourceUrls[0]?.title?.trim() || "";
  const actionsVisible = showActions || guestActionsVisible;
  const guestGated = guestActionsVisible && !showActions;
  const redirectUrl = signInRedirectForStory(story.id, signInRedirectUrl);
  const storyImageUrl = story.imageUrl?.trim() || null;
  const categoryLabel = story.category?.trim() || "";

  let categoryMarker: ReactNode = null;
  if (storyImageUrl) {
    categoryMarker = (
      <span
        className="inline-flex h-5 w-8 shrink-0 overflow-hidden rounded-4xl border border-border bg-muted"
        title={categoryLabel || undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary publisher URLs */}
        <img
          src={storyImageUrl}
          alt=""
          className="size-full object-cover"
          loading="lazy"
          decoding="async"
        />
      </span>
    );
  } else if (categoryLabel) {
    categoryMarker = (
      <Badge variant="outline" className={categoryBadgeClass(categoryLabel)}>
        {categoryLabel}
      </Badge>
    );
  }

  return (
    <article
      data-story-card
      className={cn(
        "group rounded-2xl border border-border/70 bg-card/90 p-4 shadow-paper transition-shadow hover:shadow-editorial sm:p-5",
        className,
      )}
    >
      <div className="flex gap-4">
        <div
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background"
          aria-label={`Story rank ${rank}`}
        >
          {rank}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div
              className="relative h-36 w-full shrink-0 overflow-hidden rounded-xl bg-linear-to-br from-muted via-accent/25 to-secondary sm:h-28 sm:w-40"
              aria-hidden={!story.sourceUrls.length}
            >
              <div className="absolute inset-0 flex items-end p-3">
                <span className="text-xs font-medium text-foreground/70">
                  {story.category}
                </span>
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-1.5">
                {categoryMarker}
                {story.location?.trim() ? (
                  <Badge variant="outline">{story.location}</Badge>
                ) : null}
              </div>

              <h2 className="font-display mt-2 text-xl leading-snug font-semibold text-balance">
                <Link
                  href={`/newsStory/${story.id}`}
                  className="transition-colors hover:text-primary"
                >
                  {story.title}
                </Link>
              </h2>

              {description ? (
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
              ) : null}

              {publishedMeta || primarySourceTitle ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {publishedMeta}
                  {publishedMeta && primarySourceTitle ? " · " : null}
                  {primarySourceTitle && !publishedMeta
                    ? primarySourceTitle
                    : null}
                </p>
              ) : null}
            </div>
          </div>

          {actionsVisible ? (
            <div className="flex flex-col gap-3 border-t border-border/50 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                {guestGated ? (
                  <SignInButton mode="redirect" forceRedirectUrl={redirectUrl}>
                    <Button type="button" variant="ghost" size="sm">
                      Key Takeaways
                    </Button>
                  </SignInButton>
                ) : (
                  <NewsTakeaways content={story.content} />
                )}
                <NewsStorySources sources={story.sourceUrls ?? []} />
                {guestGated ? (
                  <SignInButton mode="redirect" forceRedirectUrl={redirectUrl}>
                    <Button type="button" variant="ghost" size="sm">
                      Deep Dive
                    </Button>
                  </SignInButton>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={deepDiveStoryId === story.id}
                    onClick={() => onDeepDive(story.id)}
                  >
                    {deepDiveStoryId === story.id ? "Starting…" : "Deep Dive"}
                  </Button>
                )}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <NewsStoryVotes
                  storyId={story.id}
                  vote={{
                    upvotes: story.upvotes ?? 0,
                    downvotes: story.downvotes ?? 0,
                    netVotes: story.netVotes ?? 0,
                    userVote: story.userVote ?? null,
                  }}
                  onVote={onVote}
                  voting={votingStoryId === story.id}
                  signInRedirectUrl={guestGated ? redirectUrl : undefined}
                />

                <div className="flex flex-wrap items-center gap-2">
                  {onSaveToggle ? (
                    <StorySaveButton
                      storyId={story.id}
                      saved={story.userSaved ?? false}
                      onToggle={onSaveToggle}
                      saving={savingStoryId === story.id}
                      signInRedirectUrl={guestGated ? redirectUrl : undefined}
                    />
                  ) : null}

                  {story.content?.trim() ? (
                    guestGated ? (
                      <SignInButton mode="redirect" forceRedirectUrl={redirectUrl}>
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="gap-1 px-0"
                        >
                          Read full story
                          <ArrowRight className="size-4" aria-hidden />
                        </Button>
                      </SignInButton>
                    ) : (
                      <Sheet>
                        <SheetTrigger
                          render={
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              className="gap-1 px-0"
                            >
                              Read full story
                              <ArrowRight className="size-4" aria-hidden />
                            </Button>
                          }
                        />
                        <SheetContent
                          side="right"
                          className="w-full sm:max-w-lg px-3 mx-3"
                        >
                          <SheetHeader>
                            <SheetTitle className="font-display text-left text-xl leading-snug">
                              {story.title}
                            </SheetTitle>
                          </SheetHeader>
                          <div className="mt-4 max-h-[calc(100dvh-8rem)] overflow-y-auto pr-1">
                            <ChatMarkdown
                              content={story.content}
                              className="text-foreground"
                            />
                          </div>
                        </SheetContent>
                      </Sheet>
                    )
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
