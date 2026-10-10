import {
  getChatSessionByIdForUser,
  getPotentialStoriesByChatSessionId,
} from "@/repositories/chatSession";
import {
  POTENTIAL_STORY_TOPICS_PAGE_SIZE,
  slicePotentialStoryTopicsPage,
  type PotentialStoryTopicsPageResponse,
} from "@/services/chat/potentialStoryTopicsPagination";
import { z } from "zod";

const chatSessionIdSchema = z.uuid("chatSessionId must be a uuid");

const potentialStoryTopicsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(POTENTIAL_STORY_TOPICS_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function getPotentialStoryTopicsPageForChatSession(
  userId: string,
  chatSessionId: string,
  query: { limit?: number; offset?: number },
): Promise<PotentialStoryTopicsPageResponse | null> {
  const parsedId = chatSessionIdSchema.safeParse(chatSessionId);
  if (!parsedId.success) {
    return null;
  }

  const session = await getChatSessionByIdForUser(parsedId.data, userId);
  if (!session) {
    return null;
  }

  const parsedQuery = potentialStoryTopicsQuerySchema.parse(query);
  const allTopics = await getPotentialStoriesByChatSessionId(parsedId.data);
  return slicePotentialStoryTopicsPage(
    allTopics,
    parsedQuery.offset,
    parsedQuery.limit,
  );
}
