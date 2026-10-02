import { prisma } from "@/db";
import {
  createNotification,
  type NotificationCreateInput,
} from "@/repositories/notification";

const LOG_PREFIX = "[pipeline-notification]";

export const PIPELINE_NOTIFICATION_TYPES = {
  NEWS_PIPELINE_COMPLETED: "NEWS_PIPELINE_COMPLETED",
  NEWS_PIPELINE_RERUN_COMPLETED: "NEWS_PIPELINE_RERUN_COMPLETED",
  CHAT_RESEARCH_COMPLETED: "CHAT_RESEARCH_COMPLETED",
  DEEP_DIVE_COMPLETED: "DEEP_DIVE_COMPLETED",
  CHAT_STORY_COMPLETED: "CHAT_STORY_COMPLETED",
  RESEARCH_FAILED: "RESEARCH_FAILED",
} as const;

export function newsStoryPagePath(storyId: string): string {
  return `/newsStory/${storyId}`;
}

export function newsRequestPagePath(newsRequestId: string): string {
  return `/news/${newsRequestId}`;
}

export function chatSessionPagePath(chatSessionId: string): string {
  return `/chat/${chatSessionId}`;
}

function buildDedupeKey(type: string, entityId: string): string {
  return `${type}:${entityId}`;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error != null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}

export async function createIdempotentNotification(
  input: NotificationCreateInput & { dedupeKey: string },
): Promise<{ created: boolean; id: string | null }> {
  try {
    const row = await createNotification({
      ...input,
      read: input.read ?? false,
    });
    return { created: true, id: row.id };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const existing = await prisma.notification.findFirst({
        where: {
          userId: input.userId,
          dedupeKey: input.dedupeKey,
        },
        select: { id: true },
      });
      return { created: false, id: existing?.id ?? null };
    }
    throw error;
  }
}

export async function tryCreatePipelineNotification(
  input: NotificationCreateInput & { dedupeKey: string },
  context?: Record<string, unknown>,
): Promise<void> {
  try {
    const result = await createIdempotentNotification(input);
    console.log(
      `${LOG_PREFIX} ${result.created ? "created" : "deduped"}`,
      JSON.stringify({
        type: input.type,
        dedupeKey: input.dedupeKey,
        notificationId: result.id,
        ...context,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `${LOG_PREFIX} failed`,
      JSON.stringify({
        type: input.type,
        dedupeKey: input.dedupeKey,
        error: message,
        ...context,
      }),
    );
  }
}

export function newsPipelineCompletedNotification(input: {
  userId: string;
  newsRequestId: string;
}) {
  return {
    userId: input.userId,
    type: PIPELINE_NOTIFICATION_TYPES.NEWS_PIPELINE_COMPLETED,
    title: "News research completed",
    message: "Your news briefing is ready.",
    link: newsRequestPagePath(input.newsRequestId),
    read: false as const,
    dedupeKey: buildDedupeKey(
      PIPELINE_NOTIFICATION_TYPES.NEWS_PIPELINE_COMPLETED,
      input.newsRequestId,
    ),
  };
}

export function newsPipelineRerunCompletedNotification(input: {
  userId: string;
  newsRequestId: string;
  eventId: string;
  summary: string;
}) {
  return {
    userId: input.userId,
    type: PIPELINE_NOTIFICATION_TYPES.NEWS_PIPELINE_RERUN_COMPLETED,
    title: "Briefing refreshed",
    message: input.summary,
    link: newsRequestPagePath(input.newsRequestId),
    read: false as const,
    dedupeKey: buildDedupeKey(
      PIPELINE_NOTIFICATION_TYPES.NEWS_PIPELINE_RERUN_COMPLETED,
      `${input.newsRequestId}:${input.eventId}`,
    ),
  };
}

export function newsPipelineRerunFailedNotification(input: {
  userId: string;
  newsRequestId: string;
  eventId: string;
}) {
  return {
    userId: input.userId,
    type: PIPELINE_NOTIFICATION_TYPES.RESEARCH_FAILED,
    title: "Briefing refresh failed",
    message: "We couldn't refresh your news briefing.",
    link: newsRequestPagePath(input.newsRequestId),
    read: false as const,
    dedupeKey: buildDedupeKey(
      `${PIPELINE_NOTIFICATION_TYPES.RESEARCH_FAILED}:news-rerun`,
      `${input.newsRequestId}:${input.eventId}`,
    ),
  };
}

export function newsPipelineFailedNotification(input: {
  userId: string;
  newsRequestId: string;
}) {
  return {
    userId: input.userId,
    type: PIPELINE_NOTIFICATION_TYPES.RESEARCH_FAILED,
    title: "News research failed",
    message: "We couldn't complete your news briefing.",
    link: newsRequestPagePath(input.newsRequestId),
    read: false as const,
    dedupeKey: buildDedupeKey(
      `${PIPELINE_NOTIFICATION_TYPES.RESEARCH_FAILED}:news`,
      input.newsRequestId,
    ),
  };
}

export function chatResearchCompletedNotification(input: {
  userId: string;
  chatSessionId: string;
  chatMessageId: string;
}) {
  return {
    userId: input.userId,
    type: PIPELINE_NOTIFICATION_TYPES.CHAT_RESEARCH_COMPLETED,
    title: "Research completed",
    message: "Your research answer is ready.",
    link: chatSessionPagePath(input.chatSessionId),
    read: false as const,
    dedupeKey: buildDedupeKey(
      PIPELINE_NOTIFICATION_TYPES.CHAT_RESEARCH_COMPLETED,
      input.chatMessageId,
    ),
  };
}

export function chatResearchFailedNotification(input: {
  userId: string;
  chatSessionId: string;
  chatMessageId: string;
}) {
  return {
    userId: input.userId,
    type: PIPELINE_NOTIFICATION_TYPES.RESEARCH_FAILED,
    title: "Research failed",
    message: "We couldn't complete your research request.",
    link: chatSessionPagePath(input.chatSessionId),
    read: false as const,
    dedupeKey: buildDedupeKey(
      `${PIPELINE_NOTIFICATION_TYPES.RESEARCH_FAILED}:chat`,
      input.chatMessageId,
    ),
  };
}

export function deepDiveCompletedNotification(input: {
  userId: string;
  chatSessionId: string;
  userMessageId: string;
}) {
  return {
    userId: input.userId,
    type: PIPELINE_NOTIFICATION_TYPES.DEEP_DIVE_COMPLETED,
    title: "Deep dive completed",
    message: "Your news story research is ready.",
    link: chatSessionPagePath(input.chatSessionId),
    read: false as const,
    dedupeKey: buildDedupeKey(
      PIPELINE_NOTIFICATION_TYPES.DEEP_DIVE_COMPLETED,
      input.userMessageId,
    ),
  };
}

export function deepDiveFailedNotification(input: {
  userId: string;
  chatSessionId: string;
  userMessageId: string;
}) {
  return {
    userId: input.userId,
    type: PIPELINE_NOTIFICATION_TYPES.RESEARCH_FAILED,
    title: "Deep dive failed",
    message: "We couldn't complete your deep dive.",
    link: chatSessionPagePath(input.chatSessionId),
    read: false as const,
    dedupeKey: buildDedupeKey(
      `${PIPELINE_NOTIFICATION_TYPES.RESEARCH_FAILED}:deep-dive`,
      input.userMessageId,
    ),
  };
}

export function chatStoryCompletedNotification(input: {
  userId: string;
  storyId: string;
}) {
  return {
    userId: input.userId,
    type: PIPELINE_NOTIFICATION_TYPES.CHAT_STORY_COMPLETED,
    title: "Story ready",
    message: "Your news story is ready to review.",
    link: newsStoryPagePath(input.storyId),
    read: false as const,
    dedupeKey: buildDedupeKey(
      PIPELINE_NOTIFICATION_TYPES.CHAT_STORY_COMPLETED,
      input.storyId,
    ),
  };
}

export function chatStoryFailedNotification(input: {
  userId: string;
  storyId: string;
}) {
  return {
    userId: input.userId,
    type: PIPELINE_NOTIFICATION_TYPES.RESEARCH_FAILED,
    title: "Story generation failed",
    message: "We couldn't complete your news story.",
    link: newsStoryPagePath(input.storyId),
    read: false as const,
    dedupeKey: buildDedupeKey(
      `${PIPELINE_NOTIFICATION_TYPES.RESEARCH_FAILED}:chat-story`,
      input.storyId,
    ),
  };
}
