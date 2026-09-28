import type { SmallDeterminerResult } from "@/Agents/chat/smallDeterminerAgent";

function clientRequestedStoryCreation(shouldCreateStory: unknown): boolean {
  return shouldCreateStory === true || shouldCreateStory === "true";
}

/**
 * True when the client explicitly asked for chat→story (e.g. potential topic click).
 * Deep-dive sessions still allow this when the UI sends `shouldCreateStory: true`.
 */
export function resolveShouldCreateStoryFromEvent(
  shouldCreateStory: unknown,
  _isFromNewsStory?: boolean,
): boolean {
  return clientRequestedStoryCreation(shouldCreateStory);
}

/** Prefer session vector research when the user explicitly starts story creation. */
export function augmentDeterminerForStoryHandoff(
  determiner: SmallDeterminerResult,
  researchSourceCount: number,
  userMessageContent: string,
): SmallDeterminerResult {
  if (researchSourceCount === 0) {
    return determiner;
  }
  if (determiner.useExistingResearch && determiner.existingResearchQuery) {
    return determiner;
  }

  const topicMatch = userMessageContent.match(/^create a story about:\s*(.+)$/i);
  const query = (topicMatch?.[1] ?? userMessageContent).trim().slice(0, 400);
  if (!query) {
    return determiner;
  }

  return {
    ...determiner,
    useExistingResearch: true,
    existingResearchQuery: query,
  };
}
