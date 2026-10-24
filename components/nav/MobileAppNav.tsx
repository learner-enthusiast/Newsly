"use client";

import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ProGatedSidebarLink } from "@/components/nav/ProGatedSidebarLink";
import {
  SCRIPTS_NAV_LINK,
  SIGNED_IN_NAV_EXTRA,
  SIGNED_IN_NAV_ICONS,
} from "@/components/nav/appNavLinks";
import { SIGNED_IN_APP_NAV } from "@/components/nav/signedInAppNav";
import { cn } from "@/lib/utils";
import { Home, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type MouseEvent } from "react";

function linkClass(active: boolean) {
  return cn(
    buttonVariants({ variant: active ? "secondary" : "ghost" }),
    "w-full justify-start",
    active && "bg-accent/35 font-medium",
  );
}

/**
 * Signed-in navigation for phones: the header nav starts at `md` and the app
 * sidebar at `lg`, so below `md` this menu is the only way around the app.
 */
export function MobileAppNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close after following any link inside the menu.
  function onNavigate(event: MouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("a")) {
      setOpen(false);
    }
  }

  const extras = [SCRIPTS_NAV_LINK, ...SIGNED_IN_NAV_EXTRA];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-md text-foreground hover:bg-muted md:hidden"
            aria-label="Open menu"
          />
        }
      >
        <Menu className="size-5" aria-hidden />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-0 p-0">
        <SheetHeader className="border-b border-border/40">
          <SheetTitle className="font-brand text-xl">Newsly</SheetTitle>
        </SheetHeader>
        <nav
          className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3"
          aria-label="App"
          onClick={onNavigate}
        >
          {SIGNED_IN_APP_NAV.map((item) => {
            const Icon = SIGNED_IN_NAV_ICONS[item.href] ?? Home;
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
              <Link key={item.href} href={item.href} className={linkClass(active)}>
                <Icon data-icon="inline-start" />
                {item.label}
              </Link>
            );
          })}
          <div className="my-2 border-t border-border/40" />
          {extras.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={linkClass(item.match(pathname))}
              >
                <Icon data-icon="inline-start" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
