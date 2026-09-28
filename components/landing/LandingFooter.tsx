/**
 * Footer content constants for the public landing page.
 * Rendered through `SiteFooter` on `/`.
 */
export const LANDING_FOOTER_LINKS = [
  { href: "/about", label: "About" },
  { href: "/blog", label: "Blog" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/contact", label: "Contact" },
] as const;

/** Social labels only — wire real URLs when accounts exist. */
export const LANDING_SOCIAL_LABELS = [
  "X",
  "LinkedIn",
  "YouTube",
  "Instagram",
] as const;
