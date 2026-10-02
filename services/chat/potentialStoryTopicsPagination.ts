export const POTENTIAL_STORY_TOPICS_PAGE_SIZE = 10;

export const POTENTIAL_STORY_TOPICS_LOAD_MORE_SCROLL_THRESHOLD_PX = 80;

export type SerializedPotentialStoryTopic = {
  /** Stable position in the session list (0-based). */
  absoluteIndex: number;
  topic: string;
};

export type PotentialStoryTopicsPageResponse = {
  topics: SerializedPotentialStoryTopic[];
  hasMore: boolean;
  nextOffset: number | null;
  totalCount: number;
};

export function slicePotentialStoryTopicsPage(
  allTopics: string[],
  offset: number,
  limit: number,
): PotentialStoryTopicsPageResponse {
  const safeOffset = Math.max(0, Math.min(offset, allTopics.length));
  const slice = allTopics.slice(safeOffset, safeOffset + limit);
  const nextOffset = safeOffset + slice.length;
  const hasMore = nextOffset < allTopics.length;

  return {
    topics: slice.map((topic, index) => ({
      absoluteIndex: safeOffset + index,
      topic,
    })),
    hasMore,
    nextOffset: hasMore ? nextOffset : null,
    totalCount: allTopics.length,
  };
}

export function mergePotentialStoryTopicPages(
  existing: SerializedPotentialStoryTopic[],
  page: SerializedPotentialStoryTopic[],
): SerializedPotentialStoryTopic[] {
  const byIndex = new Map<number, SerializedPotentialStoryTopic>();
  for (const item of existing) {
    byIndex.set(item.absoluteIndex, item);
  }
  for (const item of page) {
    byIndex.set(item.absoluteIndex, item);
  }
  return [...byIndex.values()].sort(
    (a, b) => a.absoluteIndex - b.absoluteIndex,
  );
}
