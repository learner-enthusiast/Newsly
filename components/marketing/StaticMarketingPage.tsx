"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StaticMarketingPageProps = {
  eyebrow?: string;
  title: string;
  lead?: string;
  children: ReactNode;
  className?: string;
};

export function StaticMarketingPage({
  eyebrow,
  title,
  lead,
  children,
  className,
}: StaticMarketingPageProps) {
  return (
    <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-background">
      <div className="landing-section py-10 sm:py-14 lg:py-16">
        <div className={cn("mx-auto max-w-2xl", className)}>
          {eyebrow ? <p className="section-eyebrow">{eyebrow}</p> : null}
          <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {title}
          </h1>
          {lead ? (
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              {lead}
            </p>
          ) : null}
          <div className="mt-10 space-y-6 text-[0.9375rem] leading-relaxed text-foreground/90">
            {children}
          </div>
          <p className="mt-12 border-t border-border/30 pt-8 text-sm text-muted-foreground">
            <Link href="/" className="font-medium text-foreground underline-offset-4 hover:underline">
              ← Back to home
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export function StaticProseSection({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section>
      {title ? (
        <h2 className="font-display mb-3 text-xl font-semibold text-foreground">
          {title}
        </h2>
      ) : null}
      <div className="space-y-3 text-muted-foreground [&_a]:text-foreground [&_a]:underline-offset-4 [&_a]:hover:underline [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

export function StaticCard({
  title,
  description,
  meta,
  href,
}: {
  title: string;
  description: string;
  meta?: string;
  href?: string;
}) {
  const inner = (
    <>
      {meta ? (
        <p className="section-eyebrow mb-2 normal-case tracking-normal">
          {meta}
        </p>
      ) : null}
      <h3 className="font-display text-lg font-semibold text-foreground">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </>
  );

  const className =
    "block rounded-2xl border border-border/40 bg-card/80 p-5 shadow-[var(--shadow-paper)] transition-colors hover:border-border/70";

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }

  return <article className={className}>{inner}</article>;
}
