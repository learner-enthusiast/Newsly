"use client";

import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
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
  NEWS_BRIEFING_OVERDUE_MESSAGES,
  ShimmerLoadingStatus,
} from "@/components/ui/shimmer-loading-status";
import { MessageSquare, Newspaper } from "lucide-react";
import Link from "next/link";

type NewsGenerationWaitPanelProps = {
  percent: number;
  overdue: boolean;
  catchingUp: boolean;
};

export function NewsGenerationWaitPanel({
  percent,
  overdue,
  catchingUp,
}: NewsGenerationWaitPanelProps) {
  const rounded = Math.round(percent);

  return (
    <Card className="shadow-editorial">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-xl">
          {catchingUp ? "Your briefing is ready" : "Preparing your briefing"}
          <Spinner className="text-primary" />
        </CardTitle>
        <CardDescription>
          {catchingUp
            ? "Finishing the progress bar, then your stories will appear."
            : "News generation takes approximately 5 minutes. You can wait here, or look at other news and come back — this bar picks up from when the request was created."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Progress value={rounded} className="w-full">
          <div className="flex w-full items-center gap-2">
            <ProgressLabel>Research progress</ProgressLabel>
            <Spinner className="text-accent" />
            <ProgressValue />
          </div>
        </Progress>

        {overdue ? (
          <ShimmerLoadingStatus
            layout="inline"
            messages={NEWS_BRIEFING_OVERDUE_MESSAGES}
            statusLabel="Briefing still in progress"
          />
        ) : null}

        {!catchingUp ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button
              variant="brand-accent"
              size="sm"
              nativeButton={false}
              render={<Link href="/newsStory" />}
            >
              <Newspaper data-icon="inline-start" />
              Have a look at other news
            </Button>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/chat" />}
            >
              <MessageSquare data-icon="inline-start" />
              Let&apos;s chat
            </Button>
          </div>
        ) : null}

        {!catchingUp ? (
          <p className="text-sm text-muted-foreground">
            Have a topic in mind related to financial markets? Open chat and ask
            — this briefing will keep running in the background.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
