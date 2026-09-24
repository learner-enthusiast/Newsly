"use client";

import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "./ui/button";

export function SiteHeader() {
  return (
    <header className="z-50 shrink-0 border-b border-border/20 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="landing-section flex items-center justify-between gap-3 py-4">
        <Link href="/" className="font-brand shrink-0 text-xl text-foreground">
          Stock Search
        </Link>
        <Show when="signed-in">
          <nav className="hidden items-center gap-4 sm:flex">
            <Link
              href="/news"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              News
            </Link>
            <Link
              href="/chat"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Chat
            </Link>
          </nav>
        </Show>
        <div className="flex items-center gap-3">
          <Show when="signed-out">
            <SignInButton>
              <button
                type="button"
                className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
              >
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button variant="brand">Sign up</Button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </div>
    </header>
  );
}
