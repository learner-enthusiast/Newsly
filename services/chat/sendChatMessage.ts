import { inngest } from "@/clients/inngestClient";
import { MESSAGE_CHAT_PIPELINE_EVENT } from "@/inngest/chatPipeline";
import { toChatStoryCreationPayload } from "@/services/chat/chatStoryCreationPayload";
import { createChatMessage } from "@/repositories/chatMessage";
import { getChatSessionByIdForUser } from "@/repositories/chatSession";
import { createPendingChatNewsStory } from "@/repositories/newsStory";
import type { ChatStoryCreationPayload } from "@/services/news/newsRequestTypes";
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

export type SendChatMessageResult = {
  chatSessionId: string;
  chatMessageId: string;
  status: "initializing" | "ready";
  storyCreation: ChatStoryCreationPayload | null;
};

/**
 * Append a user message to an owned session and run the message research pipeline.
 * When `shouldCreateStory` is true, creates a draft `NewsStory` immediately so the
 * client can poll story status without waiting for the Inngest pipeline.
 */
export async function sendChatMessage(input: {
  userId: string;
  chatSessionId: string;
  content: string;
  shouldCreateStory?: boolean;
}): Promise<SendChatMessageResult | null> {
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

  let storyId: string | undefined;
  let storyCreation: ChatStoryCreationPayload | null = null;

  if (shouldCreateStory) {
    const story = await createPendingChatNewsStory({
      chatSessionId: session.id,
      ownerId: input.userId,
    });
    storyId = story.id;
    storyCreation = toChatStoryCreationPayload(story);
  }

  await inngest.send({
    name: MESSAGE_CHAT_PIPELINE_EVENT,
    data: {
      chatSessionId: session.id,
      chatMessageId: userMessage.id,
      shouldCreateStory,
      ...(storyId ? { storyId } : {}),
    },
  });

  return {
    chatSessionId: session.id,
    chatMessageId: userMessage.id,
    status: shouldCreateStory ? "ready" : "initializing",
    storyCreation,
  };
}
