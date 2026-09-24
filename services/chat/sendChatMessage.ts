import { inngest } from "@/clients/inngestClient";
import { MESSAGE_CHAT_PIPELINE_EVENT } from "@/inngest/chatPipeline";
import { createChatMessage } from "@/repositories/chatMessage";
import { getChatSessionByIdForUser } from "@/repositories/chatSession";
import { z } from "zod";

export const sendChatMessageBodySchema = z.object({
  content: z.string().min(1, "Message is required").max(100_000),
});

export type SendChatMessageBody = z.infer<typeof sendChatMessageBodySchema>;

/**
 * Append a user message to an owned session and run the message research pipeline.
 */
export async function sendChatMessage(input: {
  userId: string;
  chatSessionId: string;
  content: string;
}) {
  const session = await getChatSessionByIdForUser(
    input.chatSessionId,
    input.userId,
  );
  if (!session) {
    return null;
  }

  const content = sendChatMessageBodySchema.parse({ content: input.content })
    .content;

  const userMessage = await createChatMessage({
    chatSessionId: session.id,
    role: "user",
    content,
  });

  await inngest.send({
    name: MESSAGE_CHAT_PIPELINE_EVENT,
    data: {
      chatSessionId: session.id,
      chatMessageId: userMessage.id,
    },
  });

  return {
    chatSessionId: session.id,
    chatMessageId: userMessage.id,
    status: "initializing" as const,
  };
}
