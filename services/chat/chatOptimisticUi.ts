export const OPTIMISTIC_MESSAGE_ID_PREFIX = "optimistic:";

export type OptimisticChatMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

export function isOptimisticMessageId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_MESSAGE_ID_PREFIX);
}

export function createOptimisticUserMessage(content: string): OptimisticChatMessage {
  return {
    id: `${OPTIMISTIC_MESSAGE_ID_PREFIX}${crypto.randomUUID()}`,
    role: "user",
    content,
    createdAt: new Date().toISOString(),
  };
}

/** Append optimistic user messages not yet present on the server (by trimmed content). */
export function mergeOptimisticChatMessages<
  T extends { id: string; role: string; content: string },
>(serverMessages: T[], optimisticMessages: OptimisticChatMessage[]): T[] {
  if (optimisticMessages.length === 0) {
    return serverMessages;
  }

  const serverUserBodies = new Set(
    serverMessages
      .filter((message) => message.role === "user")
      .map((message) => message.content.trim()),
  );

  const pending = optimisticMessages.filter(
    (message) => !serverUserBodies.has(message.content.trim()),
  );

  if (pending.length === 0) {
    return serverMessages;
  }

  return [...serverMessages, ...(pending as unknown as T[])];
}

export function pruneConfirmedOptimisticMessages(
  optimisticMessages: OptimisticChatMessage[],
  serverMessages: Array<{ role: string; content: string }>,
): OptimisticChatMessage[] {
  if (optimisticMessages.length === 0) {
    return optimisticMessages;
  }

  const serverUserBodies = new Set(
    serverMessages
      .filter((message) => message.role === "user")
      .map((message) => message.content.trim()),
  );

  return optimisticMessages.filter(
    (message) => !serverUserBodies.has(message.content.trim()),
  );
}
