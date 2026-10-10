"use client";

import { NEWS_QUICK_PRESETS, type NewsPreset } from "@/components/news/newsPageConstants";
import { NewsRequestSummaryCard } from "@/components/news/NewsRequestSummaryCard";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { SerializedNewsRequest } from "@/services/news/newsRequestTypes";
import { ChevronRight, Clock, Zap } from "lucide-react";
import Link from "next/link";

type NewsGenerateSidebarProps = {
  recentRequests: SerializedNewsRequest[];
  recentLoading: boolean;
  onApplyPreset: (preset: NewsPreset) => void;
};

export function NewsGenerateSidebar({
  recentRequests,
  recentLoading,
  onApplyPreset,
}: NewsGenerateSidebarProps) {
  const recentPreview = recentRequests.slice(0, 4);

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardHeader className="border-b pb-4">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Zap />
            Quick presets
          </CardTitle>
          <CardDescription>One-click templates for common briefings</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 pt-0">
          {NEWS_QUICK_PRESETS.map((preset) => {
            const Icon = preset.icon;
            return (
              <Button
                key={preset.id}
                type="button"
                variant="ghost"
                className="h-auto w-full justify-between px-2 py-3"
                onClick={() => onApplyPreset(preset)}
              >
                <span className="flex min-w-0 items-start gap-3 text-left">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Icon />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{preset.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {preset.description}
                    </span>
                  </span>
                </span>
                <ChevronRight className="shrink-0 text-muted-foreground" />
              </Button>
            );
          })}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader className="border-b pb-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock />
              Recent requests
            </CardTitle>
            <Link
              href="/news/newsRequests"
              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              View all
            </Link>
          </div>
        </CardHeader>
        <CardContent className="max-h-80 overflow-y-auto pt-0">
          <div className="flex flex-col gap-3">
            {recentLoading ? (
              <>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </>
            ) : recentPreview.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Generated briefings will show up here.
              </p>
            ) : (
              recentPreview.map((request) => (
                <NewsRequestSummaryCard
                  key={request.id}
                  request={request}
                  compact
                />
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
