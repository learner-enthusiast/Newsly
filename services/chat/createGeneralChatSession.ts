import { createChatSession } from "@/repositories/chatSession";

/** Blank research chat (not tied to a news story). First user message runs the message pipeline. */
export async function createGeneralChatSession(userId: string) {
  const chatSession = await createChatSession({
    userId,
    newsStoryId: null,
    newsSourceId: [],
    isFromNewsStory: false,
    title: "New chat",
    topic: "general_research",
  });

  return {
    chatSessionId: chatSession.id,
    chatSession: {
      id: chatSession.id,
      title: chatSession.title,
      createdAt: chatSession.createdAt.toISOString(),
    },
  };
}
