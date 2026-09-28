import {
  getChatSessionByIdForUser,
  getPotentialStoriesByChatSessionId,
} from "@/repositories/chatSession";
import { z } from "zod";

const chatSessionIdSchema = z.uuid("chatSessionId must be a uuid");

export async function getPotentialStoryTopicsForChatSession(
  userId: string,
  chatSessionId: string,
): Promise<{ topics: string[] } | null> {
  const parsedId = chatSessionIdSchema.safeParse(chatSessionId);
  if (!parsedId.success) {
    return null;
  }

  const session = await getChatSessionByIdForUser(parsedId.data, userId);
  if (!session) {
    return null;
  }

  const topics = await getPotentialStoriesByChatSessionId(parsedId.data);
  return { topics };
}
