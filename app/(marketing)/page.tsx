import { ScrollHero } from "@/components/landing/ScrollHero";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Newsly — Know it first",
  description:
    "AI-ranked news for India, the world and your city, plus stock, ETF and mutual fund research.",
};

export default function LandingPage() {
  return <ScrollHero />;
}
