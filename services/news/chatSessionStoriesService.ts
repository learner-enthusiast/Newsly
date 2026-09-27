import { getChatSessionByIdForUser } from "@/repositories/chatSession";
import { listUserCreatedStoriesByChatSessionId } from "@/repositories/newsStory";
import {
  isUserStoryGenerationFailed,
  isUserStoryGenerating,
} from "@/services/news/newsStoryAccess";
import { z } from "zod";

const chatSessionIdSchema = z.uuid();

export async function listUserCreatedStoriesForChatSession(input: {
  userId: string;
  chatSessionId: string;
}) {
  const chatSessionId = chatSessionIdSchema.parse(input.chatSessionId);
  const session = await getChatSessionByIdForUser(chatSessionId, input.userId);
  if (!session) {
    return null;
  }

  const rows = await listUserCreatedStoriesByChatSessionId({
    chatSessionId,
    ownerId: input.userId,
  });

  return {
    chatSessionId,
    stories: rows.map((row) => ({
      id: row.id,
      chatSessionId: row.chatSessionId,
      ownerId: row.ownerId,
      isUserCreated: row.isUserCreated,
      publishStatus: row.publishStatus,
      isGenerating: isUserStoryGenerating({
        slug: row.slug,
        title: row.title,
        generationError: row.generationError,
      }),
      generationFailed: isUserStoryGenerationFailed({
        generationError: row.generationError,
      }),
      generationError: row.generationError,
      title: row.title,
      description: row.description,
      slug: row.slug,
      summary: row.summary,
      category: row.category,
      location: row.location,
      imageUrl: row.imageUrl,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  };
}
