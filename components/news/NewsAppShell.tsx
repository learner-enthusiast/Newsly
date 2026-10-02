"use client";

import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { ProGatedSidebarLink } from "@/components/nav/ProGatedSidebarLink";
import { SIGNED_IN_APP_NAV } from "@/components/nav/signedInAppNav";
import {
  Bookmark,
  Files,
  Home,
  Layers,
  LineChart,
  MessageSquare,
  Newspaper,
  PieChart,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

const SIDEBAR_ICONS: Record<string, LucideIcon> = {
  "/": Home,
  "/news": Newspaper,
  "/chat": MessageSquare,
  "/stockResearch": LineChart,
  "/MfResearch": PieChart,
  "/etfResearch": Layers,
  "/newsStory/saved": Files,
  "/newsStory/bookmarks": Bookmark,
};

const SIDEBAR_EXTRA = [
  {
    href: "/pricing",
    label: "Pro & billing",
    icon: Settings,
    match: (p: string) => p === "/pricing" || p.startsWith("/pricing/"),
  },
] as const;

type NewsAppShellProps = {
  children: ReactNode;
};

export function NewsAppShell({ children }: NewsAppShellProps) {
  const pathname = usePathname();

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
          {SIGNED_IN_APP_NAV.map((item) => {
            const Icon = SIDEBAR_ICONS[item.href] ?? Home;
            const active = item.match(pathname);
            if (item.proOnly) {
              return (
                <ProGatedSidebarLink
                  key={item.href}
                  item={item}
                  icon={Icon}
                  active={active}
                />
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  buttonVariants({
                    variant: active ? "secondary" : "ghost",
                  }),
                  "w-full justify-start",
                  active && "bg-accent/35 font-medium",
                )}
              >
                <Icon data-icon="inline-start" />
                {item.label}
              </Link>
            );
          })}
          {SIDEBAR_EXTRA.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  buttonVariants({
                    variant: active ? "secondary" : "ghost",
                  }),
                  "w-full justify-start",
                  active && "bg-accent/35 font-medium",
                )}
              >
                <Icon data-icon="inline-start" />
                {item.label}
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
        <header className="flex shrink-0 items-center gap-3 px-4 pt-2 pb-0 md:px-6 lg:hidden">
          <Link
            href="/news"
            className="font-brand text-2xl text-foreground"
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
