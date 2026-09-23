import {
  DEFAULT_NEWS_RESEARCH_REQUEST,
  runNewsNewChatAgent,
  type NewsNewChatResult,
} from "@/Agents/chat/newsNewChatAgent";
import { getNewsStoryWithSourcesById } from "@/repositories/newsStory";

export { DEFAULT_NEWS_RESEARCH_REQUEST };

/** Load story + sources from the DB and run the NewsNewChat prompt generator. */
export async function generateResearchPromptForNewsStory(input: {
  newsStoryId: string;
  researchRequest?: string;
  abortSignal?: AbortSignal;
}): Promise<NewsNewChatResult | null> {
  const loaded = await getNewsStoryWithSourcesById(input.newsStoryId);
  if (!loaded) {
    return null;
  }

  const { sources, ...newsStory } = loaded;
  if (sources.length === 0) {
    throw new Error("News story has no sources; cannot build research prompt");
  }

  return runNewsNewChatAgent({
    newsStoryId: input.newsStoryId,
    newsStory,
    newsSources: sources,
    researchRequest:
      input.researchRequest?.trim() || DEFAULT_NEWS_RESEARCH_REQUEST,
    abortSignal: input.abortSignal,
  });
}
