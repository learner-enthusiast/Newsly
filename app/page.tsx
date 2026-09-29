import { AboutPageShell } from "@/components/about/AboutPageShell";
import { NewslyDashboardPage } from "@/components/landing/NewslyDashboardPage";
import { NewslyLandingPage } from "@/components/landing/NewslyLandingPage";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Newsly — Don't stop at the headline",
  description:
    "Newsly researches markets, economics, and business news past the headline. Browse a briefing, ask a question, and keep the sources.",
  openGraph: {
    title: "Newsly — Don't stop at the headline",
    description:
      "Browse a briefing or investigate a question. Newsly reads the sources and lets you keep going.",
    type: "website",
  },
};

export default async function HomePage() {
  const { userId } = await auth();
  if (userId) {
    return <NewslyDashboardPage />;
  }

  return (
    <AboutPageShell>
      <NewslyLandingPage />
    </AboutPageShell>
  );
}
