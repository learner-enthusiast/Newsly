"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Renders nothing on `/` — the full-bleed landing has its own chrome. */
export function HideOnLanding({ children }: { children: ReactNode }) {
  return usePathname() === "/" ? null : children;
}
