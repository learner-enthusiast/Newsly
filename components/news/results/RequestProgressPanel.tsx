"use client";

import { NewsRequestProgress } from "@/components/news/NewsRequestProgress";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { sanitizeNewsRequestError } from "@/services/news/newsRequestProgress";
import type { SerializedNewsRequest } from "@/services/news/newsRequestTypes";
import { Button } from "@/components/ui/button";

type RequestProgressPanelProps = {
  request: SerializedNewsRequest;
  onRetry?: () => void;
  retrying?: boolean;
};

export function RequestProgressPanel({
  request,
  onRetry,
  retrying = false,
}: RequestProgressPanelProps) {
  if (request.status === "failed") {
    return (
      <Card size="sm" className="border-destructive/30">
        <CardHeader className="border-b pb-3">
          <CardTitle className="text-sm text-destructive">Request failed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4 text-sm">
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

  if (request.status === "pending") {
    return (
      <Card size="sm">
        <CardContent className="pt-4">
          <NewsRequestProgress
            loadingLogs={request.loadingLogs}
            status={request.status}
            title="Progress"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card size="sm">
      <CardHeader className="border-b pb-3">
        <CardTitle className="text-sm">Progress</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <NewsRequestProgress
          loadingLogs={request.loadingLogs}
          status={request.status}
          title="Your briefing"
        />
      </CardContent>
    </Card>
  );
}
