"use client";

import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "./ui/button";
import { ArrowRightIcon } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-border/20 bg-background/95 px-6 py-4 backdrop-blur supports-backdrop-filter:bg-background/80">
      <Link href="/" className="font-brand text-xl text-foreground">
        Puja Planner
      </Link>
      <div className="flex items-center gap-3">
        <Show when="signed-out">
          <SignInButton />

          <Button variant="brand">
            Create a Plan <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </Show>
        <Show when="signed-in">
          <UserButton />
        </Show>
      </div>
    </header>
  );
}
