"use client";

import { Spinner } from "@/components/ui/spinner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import {
  CHAT_RESEARCH_OVERDUE_MESSAGES,
  ShimmerLoadingStatus,
} from "@/components/ui/shimmer-loading-status";

type NewsStoryGenerationWaitPanelProps = {
  percent: number;
  overdue: boolean;
  catchingUp: boolean;
  progressBusy: boolean;
  pollWarning?: string | null;
};

export function NewsStoryGenerationWaitPanel({
  percent,
  overdue,
  catchingUp,
  progressBusy,
  pollWarning,
}: NewsStoryGenerationWaitPanelProps) {
  const rounded = Math.round(percent);

  return (
    <Card className="shadow-editorial">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-xl">
          {catchingUp ? "Your story is ready" : "Preparing your story"}
          {progressBusy ? <Spinner className="text-primary" /> : null}
        </CardTitle>
        <CardDescription>
          {catchingUp
            ? "Finishing the progress bar, then the full article appears."
            : "Story research takes approximately 3 minutes. Pipeline logs are in the sidebar — this page updates automatically."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Progress value={rounded} className="w-full">
          <div className="flex w-full items-center gap-2">
            <ProgressLabel>Story progress</ProgressLabel>
            {progressBusy ? <Spinner className="text-accent" /> : null}
            <ProgressValue />
          </div>
        </Progress>

        {pollWarning ? (
          <p className="text-xs text-muted-foreground">{pollWarning}</p>
        ) : null}

        {overdue && !catchingUp ? (
          <ShimmerLoadingStatus
            layout="inline"
            messages={CHAT_RESEARCH_OVERDUE_MESSAGES}
            statusLabel="Story still in progress"
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
