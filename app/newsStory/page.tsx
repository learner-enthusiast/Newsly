import { NewsStoriesListView } from "@/components/news/results/NewsStoriesListView";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Community stories — Newsly",
  description:
    "Browse top-voted news stories from the Newsly community, ranked by upvotes and recency.",
};

type NewsStoriesPageProps = {
  searchParams: Promise<{ page?: string }>;
};

export default async function NewsStoriesPage({
  searchParams,
}: NewsStoriesPageProps) {
  const params = await searchParams;
  const pageRaw = params.page ? Number.parseInt(params.page, 10) : 1;
  const initialPage =
    Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  return <NewsStoriesListView initialPage={initialPage} />;
}
