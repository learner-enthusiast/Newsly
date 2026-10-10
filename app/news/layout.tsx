import { NewsAppShell } from "@/components/news/NewsAppShell";
import { auth } from "@clerk/nextjs/server";
import type { ReactNode } from "react";

export default async function NewsLayout({ children }: { children: ReactNode }) {
  await auth.protect();
  return <NewsAppShell>{children}</NewsAppShell>;
}
