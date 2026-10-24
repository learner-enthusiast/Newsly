"use client";

import { ProBadge } from "@/components/billing/ProBadge";
import { buttonVariants } from "@/components/ui/button";
import type { SignedInAppNavItem } from "@/components/nav/signedInAppNav";
import { useIsProSubscriber } from "@/hooks/useIsProSubscriber";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type ProGatedSidebarLinkProps = {
  item: SignedInAppNavItem;
  icon: LucideIcon;
  active: boolean;
};

export function ProGatedSidebarLink({
  item,
  icon: Icon,
  active,
}: ProGatedSidebarLinkProps) {
  const { isPro, isLoading } = useIsProSubscriber();
  const locked = item.proOnly && !isLoading && !isPro;

  if (item.proOnly && isLoading) {
    return (
      <span
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "w-full justify-start opacity-45",
        )}
        aria-hidden
      >
        <Icon data-icon="inline-start" />
        <span className="truncate">{item.label}</span>
      </span>
    );
  }

  const inner = (
    <>
      <Icon data-icon="inline-start" />
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate">{item.label}</span>
        {locked ? (
          <ProBadge />
        ) : null}
      </span>
    </>
  );

  if (locked) {
    return (
      <span
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "w-full cursor-not-allowed justify-start opacity-45",
        )}
        aria-disabled
        title="Newsly Pro required"
      >
        {inner}
      </span>
    );
  }

  return (
    <Link
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
}
