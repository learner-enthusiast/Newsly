import {
  formatMessagesForQuickActions,
  runQuickActionAgent,
} from "@/Agents/chat/UIChatAgents/QuickActionAgent";
import {
  formatMessagesForTryTheseQuestions,
  runTryTheseQuestionAgent,
} from "@/Agents/chat/UIChatAgents/TryTheseQuestionAgent";
import { listRecentChatMessagesByChatSessionId } from "@/repositories/chatMessage";
import { getChatSessionByIdForUser } from "@/repositories/chatSession";
import { z } from "zod";

export const CHAT_UI_SUGGESTIONS_MESSAGE_LIMIT = 20;

const chatSessionIdSchema = z.uuid("chatSessionId must be a uuid");

const DEFAULT_TRY_THESE_QUESTIONS = [
  "What are the top five news stories today?",
  "What's happening in my city this week?",
  "Explain the latest RBI policy in simple terms?",
  "How do real estate trends compare across major Indian cities?",
  "What should I watch next in global AI developments?",
] as const;

async function loadRecentMessagesForOwnedSession(
  userId: string,
  chatSessionId: string,
): Promise<
  | { ok: true; messages: Array<{ role: string; content: string }> }
  | { ok: false; reason: "not_found" }
> {
  const parsedId = chatSessionIdSchema.safeParse(chatSessionId);
  if (!parsedId.success) {
    return { ok: false, reason: "not_found" };
  }

  const session = await getChatSessionByIdForUser(parsedId.data, userId);
  if (!session) {
    return { ok: false, reason: "not_found" };
  }

  const rows = await listRecentChatMessagesByChatSessionId(
    parsedId.data,
    CHAT_UI_SUGGESTIONS_MESSAGE_LIMIT,
  );

  return {
    ok: true,
    messages: rows.map((row) => ({
      role: row.role,
      content: row.content,
    })),
  };
}

export async function getQuickActionsForChatSession(
  userId: string,
  chatSessionId: string,
) {
  const loaded = await loadRecentMessagesForOwnedSession(userId, chatSessionId);
  if (!loaded.ok) {
    return null;
  }

  const recentMessages = formatMessagesForQuickActions(loaded.messages);
  const result = await runQuickActionAgent({ recentMessages });
  return result;
}

export async function getTryTheseQuestionsForChatSession(
  userId: string,
  chatSessionId: string,
) {
  const loaded = await loadRecentMessagesForOwnedSession(userId, chatSessionId);
  if (!loaded.ok) {
    return null;
  }

  const recentMessages = formatMessagesForTryTheseQuestions(loaded.messages);
  if (recentMessages.length === 0) {
    return { questions: [...DEFAULT_TRY_THESE_QUESTIONS] };
  }

  const result = await runTryTheseQuestionAgent({ recentMessages });
  return { questions: result.questions };
}
