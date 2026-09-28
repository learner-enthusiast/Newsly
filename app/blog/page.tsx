import { BlogPageContent } from "@/components/marketing/BlogPageContent";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog — Newsly",
  description: "Product notes and updates from the Newsly team.",
};

export default function BlogPage() {
  return <BlogPageContent />;
}
