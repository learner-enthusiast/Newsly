"use client";

/**
 * Marketing navigation for the public landing page.
 * Rendered via SiteHeader when pathname is `/` and user is signed out.
 */
export const LANDING_NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#topics", label: "Topics" },
  { href: "/#pricing", label: "Pricing" },
] as const;
