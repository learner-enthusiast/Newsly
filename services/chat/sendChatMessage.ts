import { inngest } from "@/clients/inngestClient";
import { MESSAGE_CHAT_PIPELINE_EVENT } from "@/inngest/chatPipeline";
import { createChatMessage } from "@/repositories/chatMessage";
import { getChatSessionByIdForUser } from "@/repositories/chatSession";
import { z } from "zod";

export const sendChatMessageBodySchema = z.object({
  content: z.string().min(1, "Message is required").max(100_000),
  /** When true, hand off to the chat→story pipeline (e.g. potential story topic click). */
  shouldCreateStory: z
    .union([z.boolean(), z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === true || value === "true")
    .default(false),
});

export type SendChatMessageBody = z.infer<typeof sendChatMessageBodySchema>;

/**
 * Append a user message to an owned session and run the message research pipeline.
 */
export async function sendChatMessage(input: {
  userId: string;
  chatSessionId: string;
  content: string;
  shouldCreateStory?: boolean;
}) {
  const session = await getChatSessionByIdForUser(
    input.chatSessionId,
    input.userId,
  );
  if (!session) {
    return null;
  }

  const parsed = sendChatMessageBodySchema.parse({
    content: input.content,
    shouldCreateStory: input.shouldCreateStory,
  });
  const content = parsed.content;
  const shouldCreateStory = parsed.shouldCreateStory === true;

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
      shouldCreateStory,
    },
  });

  return {
    chatSessionId: session.id,
    chatMessageId: userMessage.id,
    status: "initializing" as const,
  };
}
