"use client";

import { Skeleton } from "@/components/ui/skeleton";
import {
  CHAT_LOADING_MESSAGES,
  ShimmerLoadingStatus,
} from "@/components/ui/shimmer-loading-status";

type ChatLoadingProps = {
  variant?: "initial" | "researching";
};

export function ChatLoading({ variant = "researching" }: ChatLoadingProps) {
  if (variant === "initial") {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-10 w-2/3 max-w-md" />
        <Skeleton className="h-24 w-full max-w-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-2 py-4">
      <ShimmerLoadingStatus
        layout="inline"
        messages={CHAT_LOADING_MESSAGES}
        statusLabel="News Assistant is researching"
        className="px-1"
      />
      <Skeleton className="h-16 w-full max-w-xl" />
      <Skeleton className="h-16 w-full max-w-2xl" />
    </div>
  );
}
