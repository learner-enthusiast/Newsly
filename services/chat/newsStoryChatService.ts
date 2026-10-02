import { inngest } from "@/clients/inngestClient";
import { CHAT_PIPELINE_EVENT } from "@/inngest/newsNewchatPipeline";
import { DEFAULT_NEWS_RESEARCH_REQUEST } from "@/Agents/chat/newsNewChatAgent";
import {
  createChatMessage,
  listRecentChatMessagesByChatSessionId,
} from "@/repositories/chatMessage";
import { CHAT_MESSAGES_PAGE_SIZE } from "@/services/chat/chatMessagePagination";
import {
  createChatSession,
  getChatSessionByIdForUser,
} from "@/repositories/chatSession";
import { listResearchSourceImagesByChatSessionId } from "@/repositories/researchSource";
import {
  listNewsSourceImagesByNewsStoryId,
  listNewsSourcesByNewsStoryId,
} from "@/repositories/newsSource";
import { buildResearchSourceImageLookup } from "@/services/chat/chatResearchSourceImages";
import {
  getLatestChatOriginStoryForSession,
  getNewsStoryById,
} from "@/repositories/newsStory";
import type { ChatStoryCreationPayload } from "@/services/news/newsRequestTypes";
import { toChatStoryCreationPayload } from "@/services/chat/chatStoryCreationPayload";
import {
  isUserStoryGenerating,
} from "@/services/news/newsStoryAccess";
import { listChatSessionsForUser } from "@/services/chat/chatSessionCrud";
import { isChatAssistantProgressPlaceholder } from "@/services/chat/chatAssistantProgress";
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

function isAgentRole(role: string) {
  return role === "agent" || role === "assistant";
}

function deriveChatSessionStatus(
  messages: { role: string; content: string; createdAt: Date }[],
  latestStory: Awaited<
    ReturnType<typeof getLatestChatOriginStoryForSession>
  >,
): ChatSessionStatus {
  if (messages.length === 0) {
    return "ready";
  }

  let lastUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]!.role === "user") {
      lastUserIndex = index;
      break;
    }
  }

  if (lastUserIndex === -1) {
    return "initializing";
  }

  const lastUserMessage = messages[lastUserIndex]!;

  const repliesAfterLastUser = messages
    .slice(lastUserIndex + 1)
    .filter((row) => isAgentRole(row.role));

  if (repliesAfterLastUser.length === 0) {
    if (
      latestStory &&
      isUserStoryGenerating(latestStory) &&
      latestStory.createdAt >= lastUserMessage.createdAt
    ) {
      return "ready";
    }
    return "initializing";
  }

  const latestReply = repliesAfterLastUser.at(-1)!;
  if (latestReply.content.startsWith("Research pipeline failed:")) {
    return "failed";
  }

  if (isChatAssistantProgressPlaceholder(latestReply.content)) {
    return "initializing";
  }

  return "ready";
}

function deriveStoryCreationForChatState(
  messages: { role: string; createdAt: Date }[],
  latestStory: Awaited<
    ReturnType<typeof getLatestChatOriginStoryForSession>
  >,
): ChatStoryCreationPayload | null {
  if (!latestStory) {
    return null;
  }

  const payload = toChatStoryCreationPayload(latestStory);

  if (payload.isGenerating || payload.generationFailed) {
    return payload;
  }

  let lastUserCreatedAt: Date | null = null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]!.role === "user") {
      lastUserCreatedAt = messages[index]!.createdAt;
      break;
    }
  }

  if (!lastUserCreatedAt) {
    return null;
  }

  if (latestStory.updatedAt >= lastUserCreatedAt) {
    return payload;
  }

  return null;
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

  const story = await getNewsStoryById(parsed.newsStoryId);
  if (!story) {
    return null;
  }

  if (story.isUserCreated && story.publishStatus !== "published") {
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

  const [recentMessages, latestStory, researchSources] = await Promise.all([
    listRecentChatMessagesByChatSessionId(chatSessionId, CHAT_MESSAGES_PAGE_SIZE),
    getLatestChatOriginStoryForSession({
      chatSessionId: session.id,
      ownerId: userId,
    }),
    listResearchSourceImagesByChatSessionId(session.id),
  ]);

  const status = deriveChatSessionStatus(recentMessages, latestStory);
  const storyCreation = deriveStoryCreationForChatState(
    recentMessages,
    latestStory,
  );

  const researchSourceImages = buildResearchSourceImageLookup(researchSources);

  if (session.newsStoryId) {
    const storySources = await listNewsSourceImagesByNewsStoryId(
      session.newsStoryId,
    );
    Object.assign(
      researchSourceImages,
      buildResearchSourceImageLookup(storySources),
    );
  }

  return {
    chatSessionId: session.id,
    status,
    storyCreation,
    researchSourceImages,
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
  return listChatSessionsForUser(userId);
}
