"use client";

import { LoadingLogLines } from "@/components/shared/LoadingLogLines";
import { Spinner } from "@/components/ui/spinner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";

type NewsStoryGenerationProgressSidebarProps = {
  loadingLogs: string[];
  percent: number;
  progressBusy: boolean;
};

export function NewsStoryGenerationProgressSidebar({
  loadingLogs,
  percent,
  progressBusy,
}: NewsStoryGenerationProgressSidebarProps) {
  const rounded = Math.round(percent);

  return (
    <Card size="sm">
      <CardHeader className="border-b pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          Progress
          {progressBusy ? <Spinner className="text-primary" /> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-4">
        <LoadingLogLines loadingLogs={loadingLogs} busy={progressBusy} />

        <Progress value={rounded} className="w-full">
          <div className="flex w-full items-center gap-2">
            <ProgressLabel>Generating</ProgressLabel>
            {progressBusy ? <Spinner className="text-accent" /> : null}
            <ProgressValue />
          </div>
        </Progress>
      </CardContent>
    </Card>
  );
}
