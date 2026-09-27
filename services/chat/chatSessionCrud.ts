import { z } from "zod";
import {
  deleteChatSession,
  getChatSessionByIdForUser,
  listChatSessionsByUserId,
  patchChatSession,
} from "@/repositories/chatSession";
import { createGeneralChatSession } from "@/services/chat/createGeneralChatSession";
import { runChatSessionTitleAgent } from "@/Agents/chat/chatSessionTitleAgent";

export const renameChatSessionBodySchema = z.object({
  title: z.string().trim().min(1).max(120),
});

export const patchChatSessionBodySchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    isBookmarked: z.boolean().optional(),
  })
  .refine(
    (body) => body.title !== undefined || body.isBookmarked !== undefined,
    { message: "Provide title and/or isBookmarked" },
  );

export async function listChatSessionsForUser(userId: string) {
  const sessions = await listChatSessionsByUserId(userId);
  return sessions.map((session) => ({
    id: session.id,
    title: session.title ?? "Untitled chat",
    newsStoryId: session.newsStoryId,
    isFromNewsStory: session.isFromNewsStory,
    isBookmarked: session.isBookmarked,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  }));
}

export async function createChatSessionForUser(userId: string) {
  return createGeneralChatSession(userId);
}

export async function renameChatSessionForUser(input: {
  userId: string;
  chatSessionId: string;
  title: string;
}) {
  return patchChatSessionForUser({
    userId: input.userId,
    chatSessionId: input.chatSessionId,
    title: input.title,
  });
}

export async function patchChatSessionForUser(input: {
  userId: string;
  chatSessionId: string;
  title?: string;
  isBookmarked?: boolean;
}) {
  const parsed = patchChatSessionBodySchema.parse({
    title: input.title,
    isBookmarked: input.isBookmarked,
  });
  const session = await getChatSessionByIdForUser(
    input.chatSessionId,
    input.userId,
  );
  if (!session) {
    return null;
  }
  const updated = await patchChatSession(session.id, {
    ...(parsed.title !== undefined ? { title: parsed.title } : {}),
    ...(parsed.isBookmarked !== undefined
      ? { isBookmarked: parsed.isBookmarked }
      : {}),
  });
  return {
    id: updated.id,
    title: updated.title ?? "Untitled chat",
    isBookmarked: updated.isBookmarked,
    updatedAt: updated.updatedAt.toISOString(),
  };
}

export async function deleteChatSessionForUser(input: {
  userId: string;
  chatSessionId: string;
}) {
  const session = await getChatSessionByIdForUser(
    input.chatSessionId,
    input.userId,
  );
  if (!session) {
    return null;
  }
  await deleteChatSession(session.id);
  return { deleted: true as const, id: session.id };
}

/** Auto-title from first user message (general chats only). */
export async function autoRenameUserChatFromFirstMessage(input: {
  chatSessionId: string;
  messageContent: string;
  abortSignal?: AbortSignal;
}) {
  const title = await runChatSessionTitleAgent({
    message: input.messageContent,
    abortSignal: input.abortSignal,
  });

  await patchChatSession(input.chatSessionId, { title });
  return title;
}
