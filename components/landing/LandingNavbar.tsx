"use client";

/**
 * Marketing navigation for the public landing page.
 * Rendered via SiteHeader when pathname is `/` and user is signed out.
 */
export const LANDING_NAV_LINKS = [
  { href: "/newsStory", label: "Explore" },
  { href: "#inside", label: "How it works" },
  { href: "/about", label: "About" },
] as const;
