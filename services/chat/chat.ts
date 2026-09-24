import { inngest } from "@/clients/inngestClient";
import { CHAT_PIPELINE_EVENT } from "@/inngest/newsNewchatPipeline";
import { DEFAULT_NEWS_RESEARCH_REQUEST } from "@/Agents/chat/newsNewChatAgent";
import {
  createChatMessage,
  getChatMessageById,
  listChatMessagesByChatSessionId,
} from "@/repositories/chatMessage";
import {
  createChatSession,
  getChatSessionByIdForUser,
} from "@/repositories/chatSession";
import { listNewsSourcesByIdsForStory } from "@/repositories/newsSource";
import { getNewsStoryById } from "@/repositories/newsStory";
import { z } from "zod";

export const startNewChatInputSchema = z
  .object({
    userId: z.string().min(1),
    newsStoryId: z.uuid().optional(),
    newsSourceIds: z.array(z.uuid()).optional(),
    /** User-visible research question; defaults to the standard deep-research prompt. */
    researchRequest: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.newsStoryId &&
      (!data.newsSourceIds || data.newsSourceIds.length === 0)
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "At least one newsSourceId is required when newsStoryId is set",
        path: ["newsSourceIds"],
      });
    }
  });

export type StartNewChatInput = z.infer<typeof startNewChatInputSchema>;

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

async function resolveNewsSourceIds(
  newsStoryId: string,
  requestedIds: string[],
): Promise<string[]> {
  const story = await getNewsStoryById(newsStoryId);
  if (!story) {
    throw new Error("News story not found");
  }

  const allowed = new Set(story.newsSourceIds);
  const sources = await listNewsSourcesByIdsForStory(newsStoryId, requestedIds);

  if (sources.length !== requestedIds.length) {
    throw new Error("One or more newsSourceIds are invalid for this story");
  }

  for (const id of requestedIds) {
    if (allowed.size > 0 && !allowed.has(id)) {
      throw new Error(`newsSourceId ${id} is not linked on the news story row`);
    }
  }

  return requestedIds;
}

/**
 * Create a chat session (optionally anchored to a news story + sources),
 * persist the user's research request, and trigger the Inngest chat pipeline.
 */
export async function startNewChat(input: StartNewChatInput) {
  const parsed = startNewChatInputSchema.parse(input);
  const researchRequest =
    parsed.researchRequest?.trim() || DEFAULT_NEWS_RESEARCH_REQUEST;

  let newsSourceIds: string[] = [];
  let title: string | null = null;

  if (parsed.newsStoryId) {
    newsSourceIds = await resolveNewsSourceIds(
      parsed.newsStoryId,
      parsed.newsSourceIds!,
    );
    const story = await getNewsStoryById(parsed.newsStoryId);
    title = story?.title ?? null;
  }

  const chatSession = await createChatSession({
    userId: parsed.userId,
    newsStoryId: parsed.newsStoryId ?? null,
    newsSourceId: newsSourceIds,
    isFromNewsStory: Boolean(parsed.newsStoryId),
    title,
    topic: parsed.newsStoryId ? "news_story_research" : "general_research",
  });

  const userMessage = await createChatMessage({
    chatSessionId: chatSession.id,
    role: "user",
    content: researchRequest,
  });

  await inngest.send({
    name: CHAT_PIPELINE_EVENT,
    data: {
      userId: parsed.userId,
      chatSessionId: chatSession.id,
      userMessageId: userMessage.id,
    },
  });

  return {
    chatSession: {
      id: chatSession.id,
      userId: chatSession.userId,
      newsStoryId: chatSession.newsStoryId,
      newsSourceIds: chatSession.newsSourceId,
      isFromNewsStory: chatSession.isFromNewsStory,
      title: chatSession.title,
      topic: chatSession.topic,
      createdAt: chatSession.createdAt.toISOString(),
    },
    userMessage: serializeMessage(userMessage),
    pipelineTriggered: true as const,
  };
}

/** Poll session messages; includes assistant reply when the pipeline has finished. */
export async function getChatSessionResult(
  userId: string,
  chatSessionId: string,
) {
  const session = await getChatSessionByIdForUser(chatSessionId, userId);
  if (!session) {
    return null;
  }

  const messages = await listChatMessagesByChatSessionId(chatSessionId);

  return {
    chatSession: {
      id: session.id,
      userId: session.userId,
      newsStoryId: session.newsStoryId,
      newsSourceIds: session.newsSourceId,
      isFromNewsStory: session.isFromNewsStory,
      title: session.title,
      topic: session.topic,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    },
    messages: messages.map(serializeMessage),
    latestAssistantMessage:
      [...messages].reverse().find((row) => row.role === "agent") ?? null,
  };
}

/** Fetch a single message for the owning user (e.g. pipeline completion). */
export async function getChatMessageForUser(
  userId: string,
  chatSessionId: string,
  messageId: string,
) {
  const session = await getChatSessionByIdForUser(chatSessionId, userId);
  if (!session) {
    return null;
  }

  const message = await getChatMessageById(messageId);
  if (!message || message.chatSessionId !== chatSessionId) {
    return null;
  }

  return serializeMessage(message);
}
