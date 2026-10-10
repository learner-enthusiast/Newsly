"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowDown } from "lucide-react";

type ChatScrollToBottomFabProps = {
  visible: boolean;
  onClick: () => void;
  className?: string;
};

export function ChatScrollToBottomFab({
  visible,
  onClick,
  className,
}: ChatScrollToBottomFabProps) {
  if (!visible) {
    return null;
  }

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 z-20 flex justify-center",
        className,
      )}
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Scroll to bottom"
        className="pointer-events-auto size-9 rounded-full border-border/70 bg-background/95 shadow-md backdrop-blur-sm hover:bg-background"
        onClick={onClick}
      >
        <ArrowDown className="size-4" />
      </Button>
    </div>
  );
}
