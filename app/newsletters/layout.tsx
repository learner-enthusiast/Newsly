import { NewsAppShell } from "@/components/news/NewsAppShell";
import { auth } from "@clerk/nextjs/server";
import type { ReactNode } from "react";

export default async function NewslettersLayout({
  children,
}: {
  children: ReactNode;
}) {
  await auth.protect();
  return <NewsAppShell>{children}</NewsAppShell>;
}
