import { listTrendingNewsStories } from "@/repositories/newsStory";
import { newsStorySourceUrlSchema } from "@/repositories/newsStory";
import type { SerializedTrendingNewsStory } from "@/services/news/newsRequestTypes";

export const TRENDING_NEWS_WINDOW_DAYS = 7;
export const TRENDING_NEWS_LIMIT = 4;

function serializeTrendingStory(
  story: Awaited<ReturnType<typeof listTrendingNewsStories>>[number],
): SerializedTrendingNewsStory {
  const sourceUrls = story.sources.map((source) =>
    newsStorySourceUrlSchema.parse({
      id: source.id,
      url: source.url,
      title: source.title,
      domain: source.domain,
    }),
  );

  return {
    id: story.id,
    newsRequestId: story.newsRequestId,
    title: story.title,
    description: story.description,
    summary: story.summary,
    category: story.category,
    location: story.location,
    publishedAt: story.publishedAt?.toISOString() ?? null,
    upvotes: story.upvotes,
    downvotes: story.downvotes,
    importanceScore:
      story.importanceScore != null ? Number(story.importanceScore) : null,
    sourceUrls,
  };
}

export async function getTrendingNewsStories(): Promise<
  SerializedTrendingNewsStory[]
> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - TRENDING_NEWS_WINDOW_DAYS);
  since.setUTCHours(0, 0, 0, 0);

  const rows = await listTrendingNewsStories({
    since,
    limit: TRENDING_NEWS_LIMIT,
  });

  return rows.map(serializeTrendingStory);
}
