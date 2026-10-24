/**
 * Footer content constants, rendered through `SiteFooter`.
 */
export const LANDING_FOOTER_LINKS = [
  { href: "/about", label: "About" },
  { href: "/pricing", label: "Pricing" },
  { href: "/feature-request", label: "Feature requests" },
] as const;

/** Extra footer links shown only to signed-in users. */
export const SIGNED_IN_FOOTER_LINKS = [
  { href: "/scripts", label: "My scripts" },
] as const;

/** Social labels only — wire real URLs when accounts exist. */
export const LANDING_SOCIAL_LABELS = [
  "X",
  "LinkedIn",
  "YouTube",
  "Instagram",
] as const;
