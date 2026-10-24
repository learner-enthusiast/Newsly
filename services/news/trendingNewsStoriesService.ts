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
    imageUrl: story.imageUrl ?? null,
    sourceUrls,
  };
}

export async function getTrendingNewsStories(): Promise<
  SerializedTrendingNewsStory[]
> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - TRENDING_NEWS_WINDOW_DAYS);
  since.setUTCHours(0, 0, 0, 0);

  const recent = await listTrendingNewsStories({
    since,
    limit: TRENDING_NEWS_LIMIT,
  });

  // Top up with all-time top-voted stories so the section is never empty while public stories exist.
  const fill =
    recent.length < TRENDING_NEWS_LIMIT
      ? await listTrendingNewsStories({
          limit: TRENDING_NEWS_LIMIT - recent.length,
          excludeIds: recent.map((story) => story.id),
        })
      : [];

  return [...recent, ...fill].map(serializeTrendingStory);
}
