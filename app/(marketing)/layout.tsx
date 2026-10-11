import type { ReactNode } from "react";

/**
 * Public landing (`/`). The root layout's fixed-height shell is released while
 * `[data-landing-root]` is in the DOM (see `globals.css`), so the window scrolls
 * here instead of an inner container. A separate root layout would force a full
 * page load on every navigation between `/` and the app.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <div data-landing-root>{children}</div>;
}
