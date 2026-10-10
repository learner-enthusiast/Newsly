import { NewsStoriesListView } from "@/components/news/results/NewsStoriesListView";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My stories — Dainik Samachar",
  description: "Stories you created from chat—drafts and published.",
};

type SavedStoriesPageProps = {
  searchParams: Promise<{ page?: string }>;
};

export default async function SavedNewsStoriesPage({
  searchParams,
}: SavedStoriesPageProps) {
  const params = await searchParams;
  const pageRaw = params.page ? Number.parseInt(params.page, 10) : 1;
  const initialPage =
    Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  return (
    <NewsStoriesListView initialPage={initialPage} feed="saved" />
  );
}
