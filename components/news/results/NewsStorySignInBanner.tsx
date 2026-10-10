"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SignInButton } from "@clerk/nextjs";

type NewsStorySignInBannerProps = {
  storyId?: string;
  redirectPath?: string;
};

export function NewsStorySignInBanner({
  storyId,
  redirectPath,
}: NewsStorySignInBannerProps) {
  const path =
    redirectPath ??
    (storyId ? `/newsStory/${storyId}` : "/newsStory");
  const redirectUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${path.startsWith("/") ? path : `/${path}`}`
      : path;

  return (
    <Card className="border-accent/40 bg-accent/10">
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-foreground">
          Sign in to vote, start a deep dive, and use all story tools.
        </p>
        <SignInButton mode="redirect" forceRedirectUrl={redirectUrl}>
          <Button type="button" variant="brand-accent" size="sm">
            Sign in
          </Button>
        </SignInButton>
      </CardContent>
    </Card>
  );
}
