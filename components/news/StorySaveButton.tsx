"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SignInButton } from "@clerk/nextjs";
import { Bookmark } from "lucide-react";

type StorySaveButtonProps = {
  storyId: string;
  saved: boolean;
  onToggle: (storyId: string, nextSaved: boolean) => Promise<void>;
  saving?: boolean;
  signInRedirectUrl?: string;
  className?: string;
};

export function StorySaveButton({
  storyId,
  saved,
  onToggle,
  saving = false,
  signInRedirectUrl,
  className,
}: StorySaveButtonProps) {
  const label = saved ? "Saved" : "Save";

  if (signInRedirectUrl) {
    return (
      <SignInButton mode="redirect" forceRedirectUrl={signInRedirectUrl}>
        <Button type="button" variant="outline" size="sm" className={className}>
          <Bookmark data-icon="inline-start" />
          Save
        </Button>
      </SignInButton>
    );
  }

  return (
    <Button
      type="button"
      variant={saved ? "secondary" : "outline"}
      size="sm"
      disabled={saving}
      className={cn(saved && "border-primary/30", className)}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved stories" : "Save story"}
      onClick={() => void onToggle(storyId, !saved)}
    >
      <Bookmark
        data-icon="inline-start"
        className={cn(saved && "fill-current")}
      />
      {saving ? "Saving…" : label}
    </Button>
  );
}
