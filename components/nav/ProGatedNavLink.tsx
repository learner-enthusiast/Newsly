"use client";

import { ProBadge } from "@/components/billing/ProBadge";
import { useIsProSubscriber } from "@/hooks/useIsProSubscriber";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { SignedInAppNavItem } from "@/components/nav/signedInAppNav";

type ProGatedNavLinkProps = {
  item: SignedInAppNavItem;
  pathname: string;
  className?: string;
  activeClassName?: string;
  inactiveClassName?: string;
};

export function ProGatedNavLink({
  item,
  pathname,
  className,
  activeClassName = "text-sm font-medium text-foreground",
  inactiveClassName = "text-sm text-muted-foreground transition-colors hover:text-foreground",
}: ProGatedNavLinkProps) {
  const { isPro, isLoading } = useIsProSubscriber();
  const active = item.match(pathname);
  const locked = item.proOnly && !isLoading && !isPro;

  if (item.proOnly && isLoading) {
    return (
      <span
        className={cn(
          "text-sm text-muted-foreground/45",
          className,
        )}
        aria-hidden
      >
        {item.label}
      </span>
    );
  }

  if (locked) {
    return (
      <span
        className={cn(
          "inline-flex cursor-not-allowed items-center gap-1.5 text-sm text-muted-foreground/45",
          className,
        )}
        aria-disabled
        title="Newsly Pro required"
      >
        {item.label}
        <ProBadge />
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(active ? activeClassName : inactiveClassName, className)}
      aria-busy={item.proOnly && isLoading ? true : undefined}
    >
      {item.label}
    </Link>
  );
}
