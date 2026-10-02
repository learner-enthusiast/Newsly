/**
 * Footer content constants for the public landing page.
 * Rendered through `SiteFooter` on `/`.
 */
export const LANDING_FOOTER_LINKS = [
  { href: "/about", label: "About" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/feature-request", label: "Feature requests" },
] as const;

/** Social labels only — wire real URLs when accounts exist. */
export const LANDING_SOCIAL_LABELS = [
  "X",
  "LinkedIn",
  "YouTube",
  "Instagram",
] as const;
