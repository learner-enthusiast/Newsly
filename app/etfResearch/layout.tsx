import type { ReactNode } from "react";

export default function EtfResearchLayout({
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
