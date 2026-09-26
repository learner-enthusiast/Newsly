"use client";

import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const MARKETING_LINKS = [
  { href: "/", label: "Home" },
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#topics", label: "Topics" },
  { href: "/#pricing", label: "Pricing" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const isMarketingHome = pathname === "/";

  return (
    <header className="z-50 shrink-0 border-b border-border/20 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="landing-section flex items-center gap-4 py-4">
        <Link href="/" className="font-brand shrink-0 text-2xl text-foreground">
          Newsly
        </Link>

        <Show when="signed-out">
          {isMarketingHome ? (
            <nav
              className="hidden flex-1 items-center justify-center gap-6 md:flex"
              aria-label="Marketing"
            >
              {MARKETING_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          ) : null}
        </Show>

        <Show when="signed-in">
          <nav
            className="hidden flex-1 items-center justify-center gap-5 md:flex"
            aria-label="App"
          >
            {(
              [
                { href: "/", label: "Home", match: (p: string) => p === "/" },
                {
                  href: "/news",
                  label: "News",
                  match: (p: string) => p === "/news" || p.startsWith("/news/"),
                },
                {
                  href: "/chat",
                  label: "Chat",
                  match: (p: string) => p === "/chat" || p.startsWith("/chat/"),
                },
                {
                  href: "/news",
                  label: "Saved",
                  match: () => false,
                  disabled: true,
                },
              ] as const
            ).map((link) =>
              "disabled" in link && link.disabled ? (
                <span
                  key={link.label}
                  className="cursor-not-allowed text-sm text-muted-foreground/50"
                >
                  {link.label}
                </span>
              ) : (
                <Link
                  key={link.label}
                  href={link.href}
                  aria-current={link.match(pathname) ? "page" : undefined}
                  className={
                    link.match(pathname)
                      ? "text-sm font-medium text-foreground"
                      : "text-sm text-muted-foreground transition-colors hover:text-foreground"
                  }
                >
                  {link.label}
                </Link>
              ),
            )}
          </nav>
        </Show>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <Show when="signed-out">
            {isMarketingHome ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="hidden sm:inline-flex"
                aria-label="Search"
                disabled
              >
                <Search />
              </Button>
            ) : null}
            <SignInButton>
              <button
                type="button"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button variant="brand" size="sm" className="hidden sm:inline-flex">
                {isMarketingHome ? "Get Started" : "Sign up"}
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
