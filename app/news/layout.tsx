import { auth } from "@clerk/nextjs/server";
import type { ReactNode } from "react";

export default async function NewsLayout({ children }: { children: ReactNode }) {
  await auth.protect();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
  );
}
