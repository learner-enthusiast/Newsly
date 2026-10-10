import { AboutPageShell } from "@/components/about/AboutPageShell";
import { DainikSamacharDashboardPage } from "@/components/landing/DainikSamacharDashboardPage";
import { DainikSamacharLandingPage } from "@/components/landing/DainikSamacharLandingPage";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dainik Samachar — Don't stop at the headline",
  description:
    "Dainik Samachar researches markets, economics, and business news past the headline. Browse a briefing, ask a question, and keep the sources.",
  openGraph: {
    title: "Dainik Samachar — Don't stop at the headline",
    description:
      "Browse a briefing or investigate a question. Dainik Samachar reads the sources and lets you keep going.",
    type: "website",
  },
};

export default async function HomePage() {
  const { userId } = await auth();
  if (userId) {
    return <DainikSamacharDashboardPage />;
  }

  return (
    <AboutPageShell>
      <DainikSamacharLandingPage />
    </AboutPageShell>
  );
}
