"use client";

import { NewsRequestProgress } from "@/components/news/NewsRequestProgress";
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
import { sanitizeNewsRequestError } from "@/services/news/newsRequestProgress";
import type { SerializedNewsRequest } from "@/services/news/newsRequestTypes";
import { Button } from "@/components/ui/button";

type RequestProgressPanelProps = {
  request: SerializedNewsRequest;
  onRetry?: () => void;
  retrying?: boolean;
  progressPercent?: number;
  progressBusy?: boolean;
};

export function RequestProgressPanel({
  request,
  onRetry,
  retrying = false,
  progressPercent,
  progressBusy = false,
}: RequestProgressPanelProps) {
  if (request.status === "failed") {
    return (
      <Card size="sm" className="border-destructive/30">
        <CardHeader className="border-b pb-3">
          <CardTitle className="text-sm text-destructive">Request failed</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-4 text-sm">
          <p className="text-muted-foreground">
            {sanitizeNewsRequestError(request.error)}
          </p>
          {onRetry ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={retrying}
              onClick={onRetry}
            >
              {retrying ? "Retrying…" : "Try again"}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  const rounded = Math.round(progressPercent ?? 0);
  const showBar = progressBusy || request.status === "pending";

  return (
    <Card size="sm">
      <CardHeader className="border-b pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          Progress
          {progressBusy ? <Spinner className="text-primary" /> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-4">
        {showBar ? (
          <Progress value={rounded} className="w-full">
            <div className="flex w-full items-center gap-2">
              <ProgressLabel>Generating</ProgressLabel>
              {progressBusy ? <Spinner className="text-accent" /> : null}
              <ProgressValue />
            </div>
          </Progress>
        ) : null}
        <NewsRequestProgress
          loadingLogs={request.loadingLogs}
          status={request.status}
          title={request.status === "pending" || progressBusy ? "Progress" : "Your briefing"}
        />
      </CardContent>
    </Card>
  );
}
