import { FONT_FAMILY, FONT_HREF } from "@/lib/landing/content";
import type { ReactNode } from "react";

/**
 * Public landing (`/`). The root layout's fixed-height shell is released while
 * `[data-landing-root]` is in the DOM (see `globals.css`), so the window scrolls
 * here instead of an inner container. A separate root layout would force a full
 * page load on every navigation between `/` and the app.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* TODO: licensing — third-party font host; see FONT_HREF. React hoists this into <head>. */}
      <link rel="stylesheet" href={FONT_HREF} precedence="default" />
      <div data-landing-root style={{ fontFamily: FONT_FAMILY }}>
        {children}
      </div>
    </>
  );
}
