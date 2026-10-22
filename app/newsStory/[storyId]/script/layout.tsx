import { QueryProvider } from "@/components/providers/QueryProvider";
import type { ReactNode } from "react";

export default function VideoScriptLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <QueryProvider>{children}</QueryProvider>;
}
