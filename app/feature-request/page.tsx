import { FeatureRequestPageContent } from "@/components/marketing/FeatureRequestPageContent";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Feature requests — Dainik Samachar",
  description: "Suggest features and improvements for Dainik Samachar on GitHub.",
};

export default function FeatureRequestPage() {
  return <FeatureRequestPageContent />;
}
