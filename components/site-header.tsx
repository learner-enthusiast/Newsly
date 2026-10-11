"use client";

import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ProGatedNavLink } from "@/components/nav/ProGatedNavLink";
import { SIGNED_IN_APP_NAV } from "@/components/nav/signedInAppNav";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteHeader() {
  const pathname = usePathname();

  // `/` is the full-bleed landing with its own navbar.
  if (pathname === "/") return null;

  return (
    <header className="sticky top-0 z-50 shrink-0 border-b border-border/20 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="landing-section flex items-center gap-3 py-3 sm:gap-4 sm:py-4">
        <Link href="/" className="font-brand shrink-0 text-xl whitespace-nowrap text-foreground sm:text-2xl">
          Dainik Samachar
        </Link>

        <Show when="signed-in">
          <nav
            className="hidden flex-1 items-center justify-center gap-5 md:flex"
            aria-label="App"
          >
            {SIGNED_IN_APP_NAV.map((item) =>
              item.proOnly ? (
                <ProGatedNavLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                />
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={item.match(pathname) ? "page" : undefined}
                  className={
                    item.match(pathname)
                      ? "text-sm font-medium text-foreground"
                      : "text-sm text-muted-foreground transition-colors hover:text-foreground"
                  }
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>
        </Show>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <Show when="signed-out">
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
          </Show>
          <Show when="signed-in">
            <NotificationBell />
            <UserButton />
          </Show>
        </div>
      </div>
    </header>
  );
}
