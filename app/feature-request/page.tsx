import { FeatureRequestPageContent } from "@/components/marketing/FeatureRequestPageContent";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Feature requests — Newsly",
  description: "Suggest features and improvements for Newsly on GitHub.",
};

export default function FeatureRequestPage() {
  return <FeatureRequestPageContent />;
}
