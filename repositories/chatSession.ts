import {
  dedupeNewStoryTopics,
} from "@/Agents/chat/chatStoryIdentifierAgent";
import { z } from "zod";
import { prisma } from "@/db";

const chatSessionIdSchema = z.uuid("id must be a uuid");
const userIdSchema = z.string().min(1, "userId is required");
const newsStoryIdSchema = z.uuid("newsStoryId must be a uuid");
const newsSourceIdSchema = z.uuid("newsSourceId must be a uuid");

const chatSessionWriteSchema = z.object({
  userId: userIdSchema,
  newsStoryId: newsStoryIdSchema.nullable().optional(),
  newsSourceId: z.array(newsSourceIdSchema).optional(),
  title: z.string().min(1).nullable().optional(),
  topic: z.string().min(1).nullable().optional(),
  isFromNewsStory: z.boolean().optional(),
  isBookmarked: z.boolean().optional(),
});

const chatSessionPutSchema = chatSessionWriteSchema.omit({ userId: true });
const chatSessionPatchSchema = chatSessionPutSchema.partial();

export type ChatSessionCreateInput = z.input<typeof chatSessionWriteSchema>;
export type ChatSessionPutInput = z.input<typeof chatSessionPutSchema>;
export type ChatSessionPatchInput = z.input<typeof chatSessionPatchSchema>;

export async function createChatSession(input: ChatSessionCreateInput) {
  return prisma.chatSession.create({
    data: chatSessionWriteSchema.parse(input),
  });
}

export async function getChatSessionById(id: string) {
  return prisma.chatSession.findUnique({
    where: { id: chatSessionIdSchema.parse(id) },
  });
}

export async function getChatSessionByIdForUser(id: string, userId: string) {
  return prisma.chatSession.findFirst({
    where: {
      id: chatSessionIdSchema.parse(id),
      userId: userIdSchema.parse(userId),
    },
  });
}

export async function listChatSessionsByUserId(userId: string) {
  return prisma.chatSession.findMany({
    where: { userId: userIdSchema.parse(userId) },
    orderBy: [{ isBookmarked: "desc" }, { updatedAt: "desc" }],
  });
}

export async function putChatSession(id: string, input: ChatSessionPutInput) {
  return prisma.chatSession.update({
    where: { id: chatSessionIdSchema.parse(id) },
    data: chatSessionPutSchema.parse(input),
  });
}

export async function patchChatSession(id: string, input: ChatSessionPatchInput) {
  return prisma.chatSession.update({
    where: { id: chatSessionIdSchema.parse(id) },
    data: chatSessionPatchSchema.parse(input),
  });
}

export async function deleteChatSession(id: string) {
  return prisma.chatSession.delete({
    where: { id: chatSessionIdSchema.parse(id) },
  });
}

export async function getPotentialStoriesByChatSessionId(
  chatSessionId: string,
): Promise<string[]> {
  const session = await prisma.chatSession.findUnique({
    where: { id: chatSessionIdSchema.parse(chatSessionId) },
    select: { potentialStories: true },
  });
  return session?.potentialStories ?? [];
}

export async function appendPotentialStoriesForChatSession(
  chatSessionId: string,
  topics: string[],
): Promise<string[]> {
  const parsedId = chatSessionIdSchema.parse(chatSessionId);
  const trimmed = topics.map((topic) => topic.trim()).filter(Boolean);
  if (trimmed.length === 0) {
    return getPotentialStoriesByChatSessionId(parsedId);
  }

  const session = await prisma.chatSession.findUnique({
    where: { id: parsedId },
    select: { potentialStories: true },
  });
  if (!session) {
    throw new Error("Chat session not found");
  }

  const existing = session.potentialStories ?? [];
  const additions = dedupeNewStoryTopics(trimmed, existing);
  if (additions.length === 0) {
    return existing;
  }

  const updated = await prisma.chatSession.update({
    where: { id: parsedId },
    data: { potentialStories: [...existing, ...additions] },
    select: { potentialStories: true },
  });

  return updated.potentialStories;
}
