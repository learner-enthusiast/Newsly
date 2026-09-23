import { z } from "zod";
import { prisma } from "@/db";

const chatMessageIdSchema = z.uuid("id must be a uuid");
const chatSessionIdSchema = z.uuid("chatSessionId must be a uuid");

const chatMessageWriteSchema = z.object({
  chatSessionId: chatSessionIdSchema,
  role: z.string().min(1),
  content: z.string().min(1),
});

const chatMessagePutSchema = chatMessageWriteSchema.omit({ chatSessionId: true });
const chatMessagePatchSchema = chatMessagePutSchema.partial();

export type ChatMessageCreateInput = z.input<typeof chatMessageWriteSchema>;
export type ChatMessagePutInput = z.input<typeof chatMessagePutSchema>;
export type ChatMessagePatchInput = z.input<typeof chatMessagePatchSchema>;

export async function createChatMessage(input: ChatMessageCreateInput) {
  return prisma.chatMessage.create({
    data: chatMessageWriteSchema.parse(input),
  });
}

export async function getChatMessageById(id: string) {
  return prisma.chatMessage.findUnique({
    where: { id: chatMessageIdSchema.parse(id) },
  });
}

export async function listChatMessagesByChatSessionId(chatSessionId: string) {
  return prisma.chatMessage.findMany({
    where: { chatSessionId: chatSessionIdSchema.parse(chatSessionId) },
    orderBy: { createdAt: "asc" },
  });
}

export async function listRecentChatMessagesByChatSessionId(
  chatSessionId: string,
  limit = 10,
) {
  const rows = await prisma.chatMessage.findMany({
    where: { chatSessionId: chatSessionIdSchema.parse(chatSessionId) },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.reverse();
}

export async function putChatMessage(id: string, input: ChatMessagePutInput) {
  return prisma.chatMessage.update({
    where: { id: chatMessageIdSchema.parse(id) },
    data: chatMessagePutSchema.parse(input),
  });
}

export async function patchChatMessage(id: string, input: ChatMessagePatchInput) {
  return prisma.chatMessage.update({
    where: { id: chatMessageIdSchema.parse(id) },
    data: chatMessagePatchSchema.parse(input),
  });
}

export async function deleteChatMessage(id: string) {
  return prisma.chatMessage.delete({
    where: { id: chatMessageIdSchema.parse(id) },
  });
}
