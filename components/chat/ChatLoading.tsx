"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";

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
    <div
      className="flex flex-col gap-3 px-2 py-4"
      role="status"
      aria-live="polite"
      aria-label="News Assistant is researching"
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        News Assistant is researching…
      </div>
      <p className="text-xs text-muted-foreground">
        Finding relevant sources · Analyzing articles · Preparing your answer
      </p>
      <Skeleton className="h-16 w-full max-w-xl" />
      <Skeleton className="h-16 w-full max-w-2xl" />
    </div>
  );
}
