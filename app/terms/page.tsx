import { TermsPageContent } from "@/components/marketing/TermsPageContent";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms — Newsly",
  description: "Terms of use for the Newsly service.",
};

export default function TermsPage() {
  return <TermsPageContent />;
}
