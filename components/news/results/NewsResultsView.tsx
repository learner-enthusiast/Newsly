"use client";

import {
  ALL_STORIES_TAB,
  filterStoriesByCategoryTab,
  NewsCategoryTabs,
} from "@/components/news/results/NewsCategoryTabs";
import { KeyTopicsSidebar } from "@/components/news/results/KeyTopicsSidebar";
import { NewsRecentRequestsSidebar } from "@/components/news/results/NewsRecentRequestsSidebar";
import { NewsRequestHeader } from "@/components/news/results/NewsRequestHeader";
import { NewsRequestSummaryCard } from "@/components/news/results/NewsRequestSummaryCard";
import { NewsResultsEmptyState } from "@/components/news/results/NewsResultsEmptyState";
import { NewsStoryCard } from "@/components/news/results/NewsStoryCard";
import { RequestProgressPanel } from "@/components/news/results/RequestProgressPanel";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useRecentNewsRequests } from "@/hooks/useRecentNewsRequests";
import type { NewsRequestResultPayload } from "@/services/news/newsRequestTypes";
import { cn } from "@/lib/utils";
import gsap from "gsap";
import { ListFilter, PanelRight } from "lucide-react";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";

type NewsResultsViewProps = {
  newsId: string;
  data: NewsRequestResultPayload | null;
  isPending: boolean;
  isSuccess: boolean;
  isFailed: boolean;
  showActions: boolean;
  deepDiveStoryId: string | null;
  votingStoryId: string | null;
  savingStoryId?: string | null;
  onDeepDive: (storyId: string) => void;
  onVote: (storyId: string, vote: "UP" | "DOWN") => Promise<void>;
  onSaveToggle?: (storyId: string, nextSaved: boolean) => Promise<void>;
  onRetry?: () => void;
  retrying?: boolean;
};

export function NewsResultsView({
  newsId,
  data,
  isPending,
  isSuccess,
  isFailed,
  showActions,
  deepDiveStoryId,
  votingStoryId,
  savingStoryId = null,
  onDeepDive,
  onVote,
  onSaveToggle,
  onRetry,
  retrying,
}: NewsResultsViewProps) {
  const request = data?.newsRequest;
  const stories = data?.stories ?? [];
  const [categoryTab, setCategoryTab] = useState(ALL_STORIES_TAB);
  const { recentRequests, recentLoading } = useRecentNewsRequests();

  const headerRef = useRef<HTMLElement>(null);
  const leftRef = useRef<HTMLElement>(null);
  const rightRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredStories = filterStoriesByCategoryTab(stories, categoryTab);

  useLayoutEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion || !request) {
      return;
    }
    const ctx = gsap.context(() => {
      const targets = [
        headerRef.current,
        leftRef.current,
        rightRef.current,
        listRef.current,
      ].filter(Boolean);
      gsap.fromTo(
        targets,
        { opacity: 0, y: 10 },
        {
          opacity: 1,
          y: 0,
          duration: 0.35,
          stagger: 0.08,
          ease: "power2.out",
        },
      );
    });
    return () => ctx.revert();
    // Animate once per request load/status transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- request identity tracked via id + status
  }, [request?.id, request?.status]);

  useLayoutEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion || !listRef.current) {
      return;
    }
    const cards = listRef.current.querySelectorAll("[data-story-card]");
    gsap.fromTo(
      cards,
      { opacity: 0, y: 8 },
      {
        opacity: 1,
        y: 0,
        duration: 0.28,
        stagger: 0.06,
        ease: "power2.out",
      },
    );
  }, [categoryTab, filteredStories.length, request?.id]);

  if (!request) {
    return null;
  }

  const storyCountFound = stories.length;
  const showKeyTopics = isSuccess && storyCountFound > 0;

  const rightSidebar = (
    <div className="flex flex-col gap-4">
      <NewsRequestSummaryCard request={request} />
      <RequestProgressPanel
        request={request}
        onRetry={isFailed ? onRetry : undefined}
        retrying={retrying}
      />
      {showKeyTopics ? <KeyTopicsSidebar stories={stories} /> : null}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 md:px-6 md:py-8">
      <div className="mb-4 flex gap-2 lg:hidden">
        <Sheet>
          <SheetTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
              >
                <ListFilter data-icon="inline-start" />
                Recent requests
              </Button>
            }
          />
          <SheetContent side="left" className="w-[min(100%,320px)]">
            <SheetHeader>
              <SheetTitle>Recent requests</SheetTitle>
            </SheetHeader>
            <div className="mt-4 overflow-y-auto">
              <NewsRecentRequestsSidebar
                recentRequests={recentRequests}
                recentLoading={recentLoading}
                activeRequestId={newsId}
              />
            </div>
          </SheetContent>
        </Sheet>

        <Sheet>
          <SheetTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
              >
                <PanelRight data-icon="inline-start" />
                Summary
              </Button>
            }
          />
          <SheetContent
            side="right"
            className="w-[min(100%,360px)] overflow-y-auto"
          >
            <SheetHeader>
              <SheetTitle>Request details</SheetTitle>
            </SheetHeader>
            <div className="mt-4">{rightSidebar}</div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <div
          ref={leftRef as RefObject<HTMLDivElement>}
          className="hidden lg:block"
        >
          <NewsRecentRequestsSidebar
            recentRequests={recentRequests}
            recentLoading={recentLoading}
            activeRequestId={newsId}
          />
        </div>

        <div className="min-w-0 flex-1 space-y-6">
          <NewsRequestHeader
            request={request}
            storyCountFound={storyCountFound}
            headerRef={headerRef}
          />

          <div className="lg:hidden">{rightSidebar}</div>

          {isPending ? (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Your briefing is still being prepared. Stories will appear here
              when ready.
            </p>
          ) : null}

          {isSuccess && storyCountFound === 0 ? (
            <NewsResultsEmptyState />
          ) : null}

          {isSuccess && storyCountFound > 0 ? (
            <>
              <NewsCategoryTabs
                stories={stories}
                value={categoryTab}
                onValueChange={setCategoryTab}
              />
              <div ref={listRef} className="flex flex-col gap-4">
                {filteredStories.map((story, index) => (
                  <NewsStoryCard
                    key={story.id}
                    story={story}
                    rank={index + 1}
                    showActions={showActions}
                    deepDiveStoryId={deepDiveStoryId}
                    votingStoryId={votingStoryId}
                    savingStoryId={savingStoryId}
                    onDeepDive={onDeepDive}
                    onVote={onVote}
                    onSaveToggle={onSaveToggle}
                  />
                ))}
              </div>
            </>
          ) : null}

          {isFailed ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm lg:hidden">
              See the progress panel for retry options.
            </div>
          ) : null}
        </div>

        <aside
          ref={rightRef as RefObject<HTMLElement>}
          className={cn("hidden w-[340px] shrink-0 xl:block")}
        >
          {rightSidebar}
        </aside>
      </div>

      <aside className="mt-6 hidden md:block xl:hidden">{rightSidebar}</aside>
    </div>
  );
}
