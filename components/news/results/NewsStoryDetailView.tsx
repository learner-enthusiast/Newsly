"use client";

import { KeyTopicsSidebar } from "@/components/news/results/KeyTopicsSidebar";
import { NewsRecentRequestsSidebar } from "@/components/news/results/NewsRecentRequestsSidebar";
import { NewsRequestSummaryCard } from "@/components/news/results/NewsRequestSummaryCard";
import { NewsStoryCard } from "@/components/news/results/NewsStoryCard";
import { NewsStoryPageHeader } from "@/components/news/results/NewsStoryPageHeader";
import {
  NewsStoryStatusPanel,
  shouldRenderFullStoryBody,
  shouldShowStoryEngagement,
} from "@/components/news/results/NewsStoryStatusPanel";
import { NewsStorySignInBanner } from "@/components/news/results/NewsStorySignInBanner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useRecentNewsRequests } from "@/hooks/useRecentNewsRequests";
import type { NewsStoryPagePayload } from "@/services/news/newsRequestTypes";
import { cn } from "@/lib/utils";
import { ListFilter, PanelRight } from "lucide-react";
import { useRef, type RefObject } from "react";

type NewsStoryDetailViewProps = {
  data: NewsStoryPagePayload;
  pollWarning?: string | null;
  isSignedIn: boolean;
  showActions: boolean;
  deepDiveStoryId: string | null;
  votingStoryId: string | null;
  savingStoryId?: string | null;
  onDeepDive: (storyId: string) => void;
  onVote: (storyId: string, vote: "UP" | "DOWN") => Promise<void>;
  onSaveToggle?: (storyId: string, nextSaved: boolean) => Promise<void>;
  onPublish?: () => void;
  onUnpublish?: () => void;
  publishBusy?: boolean;
  photoUploadBusy?: boolean;
  onUploadStoryPhoto?: (file: File) => Promise<void>;
  onStoryUpdated?: (payload: NewsStoryPagePayload) => void;
};

export function NewsStoryDetailView({
  data,
  pollWarning = null,
  isSignedIn,
  showActions,
  deepDiveStoryId,
  votingStoryId,
  savingStoryId = null,
  onDeepDive,
  onVote,
  onSaveToggle,
  onPublish,
  onUnpublish,
  publishBusy = false,
  photoUploadBusy = false,
  onUploadStoryPhoto,
  onStoryUpdated,
}: NewsStoryDetailViewProps) {
  const { story, newsRequest, canViewFullBriefing } = data;
  const showFullBody = shouldRenderFullStoryBody(story);
  const showEngagement = shouldShowStoryEngagement(story);
  const showStoryActions =
    showFullBody &&
    (showEngagement || story.canEdit) &&
    (isSignedIn || !story.canEdit);
  const { recentRequests, recentLoading } = useRecentNewsRequests(isSignedIn);
  const headerRef = useRef<HTMLElement>(null);
  const leftRef = useRef<HTMLElement>(null);
  const rightRef = useRef<HTMLElement>(null);

  const rightSidebar = (
    <div className="flex flex-col gap-4">
      {newsRequest ? (
        <NewsRequestSummaryCard request={newsRequest} />
      ) : null}
      <KeyTopicsSidebar stories={showFullBody ? [story] : []} />
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 md:px-6 md:py-8">
      {!isSignedIn ? <NewsStorySignInBanner storyId={story.id} /> : null}

      {isSignedIn ? (
        <div className="mb-4 flex gap-2 lg:hidden">
          <Sheet>
            <SheetTrigger
              render={
                <Button type="button" variant="outline" size="sm" className="flex-1">
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
                  activeRequestId={newsRequest?.id}
                />
              </div>
            </SheetContent>
          </Sheet>

          <Sheet>
            <SheetTrigger
              render={
                <Button type="button" variant="outline" size="sm" className="flex-1">
                  <PanelRight data-icon="inline-start" />
                  Summary
                </Button>
              }
            />
            <SheetContent side="right" className="w-[min(100%,360px)] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Briefing context</SheetTitle>
              </SheetHeader>
              <div className="mt-4">{rightSidebar}</div>
            </SheetContent>
          </Sheet>
        </div>
      ) : null}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        {isSignedIn ? (
          <div ref={leftRef as RefObject<HTMLDivElement>} className="hidden lg:block">
            <NewsRecentRequestsSidebar
              recentRequests={recentRequests}
              recentLoading={recentLoading}
              activeRequestId={newsRequest?.id}
            />
          </div>
        ) : null}

        <div className="min-w-0 flex-1 space-y-6">
          <NewsStoryPageHeader
            story={story}
            canViewFullBriefing={canViewFullBriefing}
            newsRequestId={newsRequest?.id ?? null}
            headerRef={headerRef}
          />

          <NewsStoryStatusPanel story={story} pollWarning={pollWarning} />

          {isSignedIn ? <div className="lg:hidden">{rightSidebar}</div> : null}

          {showFullBody ? (
            <NewsStoryCard
              story={story}
              rank={1}
              showActions={Boolean(isSignedIn) && showStoryActions}
              guestActionsVisible={!isSignedIn && showEngagement}
              ownerDetailMode={story.canEdit}
              deepDiveStoryId={deepDiveStoryId}
              votingStoryId={votingStoryId}
              savingStoryId={savingStoryId}
              onDeepDive={onDeepDive}
              onVote={onVote}
              onSaveToggle={onSaveToggle}
              onPublish={onPublish}
              onUnpublish={onUnpublish}
              publishBusy={publishBusy}
              photoUploadBusy={photoUploadBusy}
              onUploadStoryPhoto={onUploadStoryPhoto}
              onStoryUpdated={onStoryUpdated}
            />
          ) : null}
        </div>

        {isSignedIn ? (
          <aside
            ref={rightRef as RefObject<HTMLElement>}
            className={cn("hidden w-[340px] shrink-0 xl:block")}
          >
            {rightSidebar}
          </aside>
        ) : null}
      </div>

      {isSignedIn ? (
        <aside className="mt-6 hidden md:block xl:hidden">{rightSidebar}</aside>
      ) : null}
    </div>
  );
}
