import { NewslyLandingPage } from "@/components/landing/NewslyLandingPage";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Newsly — Personalized News That Actually Matters",
  description:
    "AI-curated local and global news briefings from trusted sources. Choose your topics, get concise summaries, and explore original sources with Newsly.",
  openGraph: {
    title: "Newsly — Personalized News That Actually Matters",
    description:
      "Stay informed with personalized, AI-curated news briefings tailored to your location and interests.",
    type: "website",
  },
};

export default async function HomePage() {
  const { userId } = await auth();
  if (userId) {
    redirect("/news");
  }

  return <NewslyLandingPage />;
}
