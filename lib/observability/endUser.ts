import { prisma } from "@/db";
import { SYSTEM_END_USER_ID } from "@/lib/observability/neatlogs";

/**
 * Clerk id of a chat session's owner, for runs started without a request
 * (embedding jobs). Falls back to `SYSTEM_END_USER_ID`.
 */
export async function endUserForChatSession(
  chatSessionId: string,
): Promise<{ endUserId: string; userId: string | null }> {
  const session = await prisma.chatSession.findUnique({
    where: { id: chatSessionId },
    select: { userId: true },
  });
  if (!session) {
    return { endUserId: SYSTEM_END_USER_ID, userId: null };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { clerkId: true },
  });
  return { endUserId: user?.clerkId ?? SYSTEM_END_USER_ID, userId: session.userId };
}
