"use client";

import { Badge } from "@/components/ui/badge";
import { Newspaper } from "lucide-react";

type ChatDeepDiveBannerProps = {
  title: string | null;
};

export function ChatDeepDiveBanner({ title }: ChatDeepDiveBannerProps) {
  if (!title?.trim()) {
    return null;
  }

  return (
    <div className="rounded-xl border border-[#f0c4a8]/70 bg-[#fde2d2]/40 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="gap-1">
          <Newspaper className="size-3" aria-hidden />
          Deep dive
        </Badge>
        <p className="text-sm text-muted-foreground">
          Researching:{" "}
          <span className="font-medium text-foreground">{title}</span>
        </p>
      </div>
    </div>
  );
}
