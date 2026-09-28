import { ContactPageContent } from "@/components/marketing/ContactPageContent";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact — Newsly",
  description: "Contact the Newsly team for support, privacy, or partnerships.",
};

export default function ContactPage() {
  return <ContactPageContent />;
}
