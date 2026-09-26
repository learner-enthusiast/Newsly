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
          <nav className="hidden flex-1 items-center justify-center gap-4 md:flex">
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
