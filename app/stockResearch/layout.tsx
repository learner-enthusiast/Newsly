import type { ReactNode } from "react";

/**
 * Fixed-height frame (root body is `overflow-hidden`). Each page scrolls its own
 * columns independently instead of scrolling the whole page.
 */
export default function StockResearchLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {children}
    </div>
  );
}
