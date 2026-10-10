import { NewsRequestsListView } from "@/components/news/NewsRequestsListView";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "News requests — Dainik Samachar",
  description: "Browse and open your generated news briefings.",
};

export default function NewsRequestsPage() {
  return <NewsRequestsListView />;
}
