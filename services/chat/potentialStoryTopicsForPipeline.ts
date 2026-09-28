import {
  formatMessagesForPotentialStoryTopicAgent,
  POTENTIAL_STORY_TOPIC_MESSAGE_LIMIT,
} from "@/Agents/chat/chatStoryIdentifierAgent";

export function buildRecentMessagesForPotentialStoryTopicAgent(input: {
  recentMessages: Array<{ role: string; content: string }>;
  userMessage: { role: string; content: string };
}): Array<{ role: string; content: string }> {
  return formatMessagesForPotentialStoryTopicAgent([
    ...input.recentMessages,
    {
      role: input.userMessage.role,
      content: input.userMessage.content,
    },
  ]).slice(-POTENTIAL_STORY_TOPIC_MESSAGE_LIMIT);
}
