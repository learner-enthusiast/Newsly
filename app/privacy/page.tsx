import { PrivacyPageContent } from "@/components/marketing/PrivacyPageContent";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy — Newsly",
  description: "How Newsly handles your data and privacy.",
};

export default function PrivacyPage() {
  return <PrivacyPageContent />;
}
