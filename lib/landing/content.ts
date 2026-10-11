/**
 * Copy, routes, colours and media for the scroll-tied landing at `/`.
 * Change wording or destinations here, not in the components.
 */

export const DARK = "#1D3045";

/** DARK at an alpha (0–1), e.g. `dark(0.8)`. */
export function dark(alpha: number): string {
  return `rgb(29 48 69 / ${alpha})`;
}

/**
 * Source clip for `scripts/build-hero-frames.sh` only — the page plays the
 * self-hosted image sequence in `public/landing/frames/` and never loads this.
 */
export const HERO_SOURCE_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260821_114821_a8ca298f-be2c-4613-a4dd-51b69e16bbde.mp4";

// TODO: licensing — this font is served by a third-party site; replace with a
// licensed font before production.
export const FONT_HREF =
  "https://db.onlinewebfonts.com/c/95cecf452d3208890088a5b4c19c7ecf?family=Helvetica+Neue+ME";

export const FONT_FAMILY =
  "'Helvetica Neue ME', 'Helvetica Neue', Helvetica, Arial, sans-serif";

export const ROUTES = {
  landing: "/",
  app: "/home",
  news: "/newsStory",
  research: "/stockResearch",
  chat: "/chat",
  newsletters: "/newsletters",
  newsletterCreate: "/newsletters/new",
} as const;
// Sign-in / sign-up are Clerk modals (SignInButton / SignUpButton), not routes.

export const NAV_LINKS = [
  { label: "Dainik Samachar", href: ROUTES.landing, active: true },
  { label: "News", href: ROUTES.news, active: false },
  { label: "Research", href: ROUTES.research, active: false },
  { label: "Chat", href: ROUTES.chat, active: false },
  { label: "Newsletters", href: ROUTES.newsletters, active: false },
] as const;

export const NAV_COPY = {
  signIn: "Sign in",
  signUp: "Sign up",
  openApp: "Open app",
  newsletters: "Newsletters",
  menu: "Menu",
  openMenu: "Open menu",
  closeMenu: "Close menu",
  mainNav: "Main",
  mobileNav: "Mobile",
} as const;

export const HERO_INTRO = {
  title: "Know what moves your money first",
  subtitle: "India · World · Your city",
  ctaLabel: "Go to today's news",
} as const;

export const HERO_MISSION = {
  lead: "We rank every headline by impact ",
  mid: "and evidence",
  tail: "so you read only what matters",
  nextLabel: "Next",
  topLabel: "Back to top",
} as const;

export const HERO_CTA = {
  eyebrow: "Dainik Samachar | दैनिक समाचार",
  titleLines: ["Read less,", "know more."],
  cta: "Get the daily briefing",
} as const;
