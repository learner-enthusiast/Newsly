"use client";

import { LoadingLogLines } from "@/components/shared/LoadingLogLines";
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

type ChatMessageResearchWaitPanelProps = {
  loadingLogs: string[];
  percent: number;
  overdue: boolean;
  catchingUp: boolean;
  progressBusy: boolean;
};

export function ChatMessageResearchWaitPanel({
  loadingLogs,
  percent,
  overdue,
  catchingUp,
  progressBusy,
}: ChatMessageResearchWaitPanelProps) {
  const rounded = Math.round(percent);

  return (
    <Card size="sm" className="border-dashed shadow-sm">
      <CardHeader className="border-b pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          {catchingUp ? "Research complete" : "Researching your question"}
          {progressBusy ? <Spinner className="text-primary" /> : null}
        </CardTitle>
        <CardDescription>
          {catchingUp
            ? "Finishing the progress bar, then your reply appears above."
            : "Chat research takes approximately 3 minutes. Logs update as the pipeline runs."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-4">
        <LoadingLogLines
          loadingLogs={loadingLogs}
          busy={progressBusy && !catchingUp}
        />

        <Progress value={rounded} className="w-full">
          <div className="flex w-full items-center gap-2">
            <ProgressLabel>Research progress</ProgressLabel>
            {progressBusy ? <Spinner className="text-accent" /> : null}
            <ProgressValue />
          </div>
        </Progress>

        {overdue && !catchingUp ? (
          <ShimmerLoadingStatus
            layout="inline"
            messages={CHAT_RESEARCH_OVERDUE_MESSAGES}
            statusLabel="Research still in progress"
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
