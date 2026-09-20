"use client";

import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "./ui/button";
import { ArrowRightIcon } from "lucide-react";

const NAV_LINKS = [
  { href: "/#explore", label: "Explore" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#festivals", label: "Festivals" },
  { href: "/plans", label: "Plans" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/20 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="landing-section flex items-center justify-between gap-3 py-4">
        <Link href="/" className="font-brand shrink-0 text-xl text-foreground">
          Puja Planner
        </Link>
        <nav
          className="hidden items-center gap-6 text-sm text-muted-foreground md:flex"
          aria-label="Main"
        >
          {NAV_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
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
            <Button variant="brand">
              Create a Plan <ArrowRightIcon data-icon="inline-end" />
            </Button>
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
