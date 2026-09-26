/**
 * Footer content constants for the public landing page.
 * Rendered through `SiteFooter` on `/`.
 */
export const LANDING_FOOTER_LINKS = [
  { href: "#", label: "About" },
  { href: "#", label: "Blog" },
  { href: "#", label: "Privacy" },
  { href: "#", label: "Terms" },
  { href: "#", label: "Contact" },
] as const;

/** Social labels only — wire real URLs when accounts exist. */
export const LANDING_SOCIAL_LABELS = [
  "X",
  "LinkedIn",
  "YouTube",
  "Instagram",
] as const;
