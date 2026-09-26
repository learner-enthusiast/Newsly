"use client";

import { LANDING_NAV_LINKS } from "@/components/landing/LandingNavbar";
import { GetStartedButton } from "@/components/landing/GetStartedButton";
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Menu, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteHeader() {
  const pathname = usePathname();
  const isMarketingHome = pathname === "/";

  return (
    <header className="sticky top-0 z-50 shrink-0 border-b border-border/20 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="landing-section flex items-center gap-3 py-3 sm:gap-4 sm:py-4">
        <Link href="/" className="font-brand shrink-0 text-2xl text-foreground">
          Newsly
        </Link>

        <Show when="signed-out">
          {isMarketingHome ? (
            <nav
              className="hidden flex-1 items-center justify-center gap-6 lg:flex"
              aria-label="Marketing"
            >
              {LANDING_NAV_LINKS.map((link) => (
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
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="hidden sm:inline-flex"
                  aria-label="Search (coming soon)"
                  disabled
                >
                  <Search />
                </Button>
                <SignInButton mode="modal">
                  <button
                    type="button"
                    className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
                  >
                    Sign In
                  </button>
                </SignInButton>
                <div className="hidden sm:block">
                  <GetStartedButton size="sm" label="Get Started" />
                </div>

                <Sheet>
                  <SheetTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        className="lg:hidden"
                        aria-label="Open menu"
                      />
                    }
                  >
                    <Menu />
                  </SheetTrigger>
                  <SheetContent side="right" className="w-[min(100%,320px)]">
                    <SheetHeader>
                      <SheetTitle className="font-brand text-left text-xl">
                        Newsly
                      </SheetTitle>
                    </SheetHeader>
                    <nav className="mt-4 flex flex-col gap-1" aria-label="Mobile marketing">
                      {LANDING_NAV_LINKS.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          className="rounded-md px-2 py-2.5 text-sm font-medium hover:bg-muted"
                        >
                          {link.label}
                        </Link>
                      ))}
                    </nav>
                    <div className="mt-6 flex flex-col gap-3 border-t border-border/40 pt-4">
                      <SignInButton mode="modal">
                        <Button type="button" variant="outline" className="w-full">
                          Sign In
                        </Button>
                      </SignInButton>
                      <SignUpButton mode="modal">
                        <Button type="button" variant="brand-accent" className="w-full">
                          Get Started
                        </Button>
                      </SignUpButton>
                    </div>
                  </SheetContent>
                </Sheet>
              </>
            ) : (
              <>
                <SignInButton mode="modal">
                  <button
                    type="button"
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Sign in
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <Button variant="brand" size="sm" className="hidden sm:inline-flex">
                    Sign up
                  </Button>
                </SignUpButton>
              </>
            )}
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </div>
    </header>
  );
}
