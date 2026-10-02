import { listNewsSourcesByNewsRequestId } from "@/repositories/newsSource";
import { listNewsStoriesByNewsRequestId } from "@/repositories/newsStory";
import type { ResearchedArticle } from "@/Agents/news/NewsSythesizeragent";
import {
  buildKnownSourceIndex,
  type KnownSourceIndex,
} from "@/services/news/newsRerunKnownSources";
import {
  boundaryToIsoDate,
  resolveNewsRerunResearchBoundary,
} from "@/services/news/newsRerunBoundary";
import type { NewsRerunStorySummary } from "@/services/news/newsRerunTypes";

export type NewsRerunPreviousContext = {
  stories: NewsRerunStorySummary[];
  knownSourceUrlKeys: string[];
  knownYoutubeVideoIds: string[];
  boundaryIso: string;
  boundaryIsoDate: string;
  sourcesByStoryId: Record<string, ResearchedArticle[]>;
};

export function hydrateKnownSourceIndex(context: {
  knownSourceUrlKeys: string[];
  knownYoutubeVideoIds: string[];
}): KnownSourceIndex {
  return {
    urlKeys: new Set(context.knownSourceUrlKeys),
    youtubeVideoIds: new Set(context.knownYoutubeVideoIds),
  };
}

function trimForModel(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max)}…`;
}

export async function loadNewsRerunPreviousContext(
  newsRequestId: string,
  requestRow: {
    completedAt: Date | null;
    createdAt: Date;
  },
): Promise<NewsRerunPreviousContext> {
  const [stories, sources] = await Promise.all([
    listNewsStoriesByNewsRequestId(newsRequestId),
    listNewsSourcesByNewsRequestId(newsRequestId),
  ]);

  let storyUpdatedAtMax: Date | null = null;
  for (const story of stories) {
    if (!storyUpdatedAtMax || story.updatedAt > storyUpdatedAtMax) {
      storyUpdatedAtMax = story.updatedAt;
    }
  }

  let sourcePublishedAtMax: Date | null = null;
  for (const source of sources) {
    if (source.publishedAt) {
      if (!sourcePublishedAtMax || source.publishedAt > sourcePublishedAtMax) {
        sourcePublishedAtMax = source.publishedAt;
      }
    }
  }

  const boundary = resolveNewsRerunResearchBoundary({
    completedAt: requestRow.completedAt,
    createdAt: requestRow.createdAt,
    storyUpdatedAtMax,
    sourcePublishedAtMax,
  });

  const sourcesByStoryId: Record<string, ResearchedArticle[]> = {};
  for (const source of sources) {
    const list = sourcesByStoryId[source.newsStoryId] ?? [];
    list.push({
      url: source.url,
      domain: source.domain,
      title: source.title,
      scrapedContent: source.scrapedContent,
      publishedAt: source.publishedAt,
      sourceType: source.sourceType,
      transcript: source.transcript,
      isPrimaryStorySource: !source.sourceType.toLowerCase().includes("youtube"),
      imageUrl: source.imageUrl,
    });
    sourcesByStoryId[source.newsStoryId] = list;
  }

  const storySummaries: NewsRerunStorySummary[] = stories.map((story) => ({
    id: story.id,
    title: story.title,
    summary: trimForModel(story.summary, 600),
    category: story.category,
    slug: story.slug,
  }));

  const known = buildKnownSourceIndex(sources);

  return {
    stories: storySummaries,
    knownSourceUrlKeys: [...known.urlKeys],
    knownYoutubeVideoIds: [...known.youtubeVideoIds],
    boundaryIso: boundary.toISOString(),
    boundaryIsoDate: boundaryToIsoDate(boundary),
    sourcesByStoryId,
  };
}
