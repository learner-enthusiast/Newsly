import { NewsStoriesListView } from "@/components/news/results/NewsStoriesListView";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bookmarked stories — Newsly",
  description: "Community stories you saved for later.",
};

type BookmarkedStoriesPageProps = {
  searchParams: Promise<{ page?: string }>;
};

export default async function BookmarkedNewsStoriesPage({
  searchParams,
}: BookmarkedStoriesPageProps) {
  const params = await searchParams;
  const pageRaw = params.page ? Number.parseInt(params.page, 10) : 1;
  const initialPage =
    Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  return (
    <NewsStoriesListView initialPage={initialPage} feed="bookmarks" />
  );
}
