import { DainikSamacharDashboardPage } from "@/components/landing/DainikSamacharDashboardPage";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your desk — Dainik Samachar",
  description: "Pick up a story, or ask a question.",
};

/** Signed-in home (moved from `/`, which is now the public landing). */
export default async function HomePage() {
  await auth.protect();
  return <DainikSamacharDashboardPage />;
}
