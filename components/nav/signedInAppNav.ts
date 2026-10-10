export type SignedInAppNavItem = {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
  proOnly?: boolean;
};

export const SIGNED_IN_APP_NAV: SignedInAppNavItem[] = [
  { href: "/", label: "Home", match: (p) => p === "/" },
  {
    href: "/news",
    label: "News",
    match: (p) => p === "/news" || p.startsWith("/news/"),
  },
  {
    href: "/chat",
    label: "Chat",
    match: (p) => p === "/chat" || p.startsWith("/chat/"),
  },
  {
    href: "/stockResearch",
    label: "Stock research",
    match: (p) => p === "/stockResearch" || p.startsWith("/stockResearch/"),
    proOnly: true,
  },
  {
    href: "/MfResearch",
    label: "MF research",
    match: (p) => p === "/MfResearch" || p.startsWith("/MfResearch/"),
    proOnly: true,
  },
  {
    href: "/etfResearch",
    label: "ETF research",
    match: (p) => p === "/etfResearch" || p.startsWith("/etfResearch/"),
    proOnly: true,
  },
  {
    href: "/newsStory/saved",
    label: "Saved",
    match: (p) =>
      p === "/newsStory/saved" || p.startsWith("/newsStory/saved/"),
  },
  {
    href: "/newsStory/bookmarks",
    label: "Bookmarks",
    match: (p) =>
      p === "/newsStory/bookmarks" || p.startsWith("/newsStory/bookmarks/"),
  },
];
