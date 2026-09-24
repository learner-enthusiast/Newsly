import { auth } from "@clerk/nextjs/server";
import type { ReactNode } from "react";

export default async function ChatLayout({ children }: { children: ReactNode }) {
  await auth.protect();
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
  );
}
