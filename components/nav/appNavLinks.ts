import {
  Bookmark,
  Clapperboard,
  Code,
  Files,
  Home,
  Layers,
  LineChart,
  Mail,
  MessageSquare,
  Newspaper,
  PieChart,
  Settings,
  type LucideIcon,
} from "lucide-react";

/** Icons for `SIGNED_IN_APP_NAV` entries, keyed by href (sidebar + mobile menu). */
export const SIGNED_IN_NAV_ICONS: Record<string, LucideIcon> = {
  "/": Home,
  "/news": Newspaper,
  "/newsletters": Mail,
  "/chat": MessageSquare,
  "/stockResearch": LineChart,
  "/MfResearch": PieChart,
  "/etfResearch": Layers,
  "/newsStory/saved": Files,
  "/newsStory/bookmarks": Bookmark,
};

/** Account links listed after the main nav in the sidebar. */
export const SIGNED_IN_NAV_EXTRA = [
  {
    href: "/pricing",
    label: "Pro & billing",
    icon: Settings,
    match: (p: string) => p === "/pricing" || p.startsWith("/pricing/"),
  },
  {
    href: "/settings/developers",
    label: "Developers",
    icon: Code,
    match: (p: string) =>
      p === "/settings/developers" || p.startsWith("/settings/developers/"),
  },
] as const;

/** Mobile menu only: the sidebar has no scripts entry (desktop reaches it via the footer). */
export const SCRIPTS_NAV_LINK = {
  href: "/scripts",
  label: "My scripts",
  icon: Clapperboard,
  match: (p: string) => p === "/scripts" || p.startsWith("/scripts/"),
} as const;
