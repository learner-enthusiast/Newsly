"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  Bookmark,
  Home,
  MessageSquare,
  Newspaper,
  Search,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  exact: boolean;
  disabled?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: Home, exact: true },
  { href: "/news", label: "News", icon: Newspaper, exact: false },
  { href: "/chat", label: "Chat", icon: MessageSquare, exact: false },
  {
    href: "/news",
    label: "Saved",
    icon: Bookmark,
    exact: false,
    disabled: true,
  },
  {
    href: "/news",
    label: "Settings",
    icon: Settings,
    exact: false,
    disabled: true,
  },
];

type NewsAppShellProps = {
  children: ReactNode;
};

export function NewsAppShell({ children }: NewsAppShellProps) {
  const pathname = usePathname();

  function isActive(href: string, exact: boolean) {
    if (exact) {
      return pathname === href;
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="flex min-h-0 flex-1 bg-background">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border/40 bg-card/40 lg:flex">
        <Link
          href="/news"
          className="font-brand border-b border-border/40 px-4 py-4 text-2xl text-foreground"
        >
          Newsly
        </Link>
        <div className="flex flex-col gap-1 p-3">
          {NAV_ITEMS.map((item) => {
            const active = !item.disabled && isActive(item.href, item.exact);
            const Icon = item.icon;
            const inner = (
              <>
                <Icon data-icon="inline-start" />
                {item.label}
              </>
            );
            if (item.disabled) {
              return (
                <Button
                  key={item.label}
                  type="button"
                  variant="ghost"
                  className="w-full justify-start opacity-50"
                  disabled
                >
                  {inner}
                </Button>
              );
            }
            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  buttonVariants({
                    variant: active ? "secondary" : "ghost",
                  }),
                  "w-full justify-start",
                  active && "bg-accent/35 font-medium",
                )}
              >
                {inner}
              </Link>
            );
          })}
        </div>
        <div className="mt-auto border-t border-border/40 p-4">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Search usage</span>
            <span>—</span>
          </div>
          <Progress value={0} />
          <p className="mt-2 text-xs text-muted-foreground">
            SerpAPI searches this month
          </p>
        </div>
      </aside>

      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-0">
        <header className="flex shrink-0 items-center gap-3 border-b border-border/40 bg-card/30 px-4 py-3 md:px-6">
          <Link
            href="/news"
            className="font-brand text-2xl text-foreground lg:hidden"
          >
            Newsly
          </Link>
          {/* <div className="relative mx-auto hidden w-full max-w-xl lg:block">
            <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              readOnly
              placeholder="Search your past news, topics, or ask anything…"
              className="h-10 rounded-full bg-background pl-10"
            />
            <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
              ⌘ K
            </kbd>
          </div> */}
        </header>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
