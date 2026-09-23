import { inngest } from "@/clients/inngestClient";
import { CHAT_PIPELINE_EVENT } from "@/inngest/chatPipeline";
import { DEFAULT_NEWS_RESEARCH_REQUEST } from "@/Agents/chat/newsNewChatAgent";
import {
  createChatMessage,
  listChatMessagesByChatSessionId,
} from "@/repositories/chatMessage";
import {
  createChatSession,
  getChatSessionByIdForUser,
  listChatSessionsByUserId,
} from "@/repositories/chatSession";
import { listNewsSourcesByNewsStoryId } from "@/repositories/newsSource";
import {
  getNewsStoryById,
  getNewsStoryByIdForUser,
} from "@/repositories/newsStory";
import { z } from "zod";

export const newsStoryChatBodySchema = z.object({
  newsStoryId: z.uuid(),
  researchRequest: z.string().min(1).optional(),
});

export type ChatSessionStatus = "initializing" | "ready" | "failed";

function serializeMessage(message: {
  id: string;
  chatSessionId: string;
  role: string;
  content: string;
  createdAt: Date;
}) {
  return {
    id: message.id,
    chatSessionId: message.chatSessionId,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}

function deriveChatSessionStatus(
  messages: { role: string; content: string }[],
): ChatSessionStatus {
  const agentMessages = messages.filter(
    (row) => row.role === "agent" || row.role === "assistant",
  );
  if (agentMessages.length === 0) {
    return "initializing";
  }
  const latestAgent = agentMessages.at(-1);
  if (latestAgent?.content.startsWith("Research pipeline failed:")) {
    return "failed";
  }
  return "ready";
}

async function resolveStorySourceIds(newsStoryId: string): Promise<string[]> {
  const sources = await listNewsSourcesByNewsStoryId(newsStoryId);
  if (sources.length === 0) {
    throw new Error("News story has no linked sources");
  }

  const story = await getNewsStoryById(newsStoryId);
  if (story && story.newsSourceIds.length > 0) {
    const byId = new Map(sources.map((source) => [source.id, source]));
    const ordered = story.newsSourceIds
      .map((id) => byId.get(id))
      .filter((source): source is (typeof sources)[number] => source != null)
      .map((source) => source.id);
    if (ordered.length > 0) {
      return ordered;
    }
  }

  return sources.map((source) => source.id);
}

export async function startNewsStoryChat(input: {
  userId: string;
  newsStoryId: string;
  researchRequest?: string;
}) {
  const parsed = newsStoryChatBodySchema.parse({
    newsStoryId: input.newsStoryId,
    researchRequest: input.researchRequest,
  });

  const story = await getNewsStoryByIdForUser(parsed.newsStoryId, input.userId);
  if (!story) {
    return null;
  }

  const newsSourceIds = await resolveStorySourceIds(parsed.newsStoryId);
  const researchRequest =
    parsed.researchRequest?.trim() || DEFAULT_NEWS_RESEARCH_REQUEST;

  const chatSession = await createChatSession({
    userId: input.userId,
    newsStoryId: story.id,
    newsSourceId: newsSourceIds,
    isFromNewsStory: true,
    title: story.title,
    topic: "news_story_deep_dive",
  });

  const userMessage = await createChatMessage({
    chatSessionId: chatSession.id,
    role: "user",
    content: researchRequest,
  });

  await inngest.send({
    name: CHAT_PIPELINE_EVENT,
    data: {
      userId: input.userId,
      chatSessionId: chatSession.id,
      userMessageId: userMessage.id,
    },
  });

  return {
    chatSessionId: chatSession.id,
    status: "initializing" as const,
  };
}

export async function getNewsStoryChatState(
  userId: string,
  chatSessionId: string,
) {
  const session = await getChatSessionByIdForUser(chatSessionId, userId);
  if (!session) {
    return null;
  }

  const messages = await listChatMessagesByChatSessionId(chatSessionId);
  const status = deriveChatSessionStatus(messages);

  return {
    chatSessionId: session.id,
    status,
    messages: messages.map(serializeMessage),
    chatSession: {
      id: session.id,
      title: session.title,
      newsStoryId: session.newsStoryId,
      isFromNewsStory: session.isFromNewsStory,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    },
  };
}

export async function listUserChatSessionsForUi(userId: string) {
  const sessions = await listChatSessionsByUserId(userId);
  return sessions.map((session) => ({
    id: session.id,
    title: session.title ?? "Untitled chat",
    newsStoryId: session.newsStoryId,
    isFromNewsStory: session.isFromNewsStory,
    updatedAt: session.updatedAt.toISOString(),
  }));
}
