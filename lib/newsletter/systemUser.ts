import { prisma } from "@/db";

const SYNTHETIC_CLERK_ID = "system-newsletter-editions";
const SYNTHETIC_EMAIL = "system-newsletter@internal.local";

/** @deprecated Use {@link resolveSystemUserId} — env may be Clerk id, not internal id. */
export function getSystemUserIdFromEnv(): string {
  const id = process.env.SYSTEM_USER_ID?.trim();
  if (!id) {
    throw new Error("SYSTEM_USER_ID is not configured");
  }
  return id;
}

export function readSystemUserConfig():
  | { kind: "clerk"; clerkId: string }
  | { kind: "id"; userId: string }
  | null {
  const clerkId = process.env.SYSTEM_USER_CLERK_ID?.trim();
  if (clerkId) {
    return { kind: "clerk", clerkId };
  }
  const userId = process.env.SYSTEM_USER_ID?.trim();
  if (userId) {
    return { kind: "id", userId };
  }
  return null;
}

/** Creates the synthetic system user when using `SYSTEM_USER_ID` (not needed for Clerk id). */
export async function ensureSyntheticSystemUser(userId: string): Promise<void> {
  await prisma.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      clerkId: SYNTHETIC_CLERK_ID,
      email: SYNTHETIC_EMAIL,
      firstName: "System",
      lastName: "Newsletter",
    },
    update: {},
  });
}

/**
 * Internal `users.id` for shared newsletter editions (`NewsRequest.userId`).
 * Configure **one** of:
 * - `SYSTEM_USER_CLERK_ID` — your Clerk user id (`user_…`); local row must exist (sign in once).
 * - `SYSTEM_USER_ID` — internal cuid; synthetic user is created automatically if missing.
 */
export async function resolveSystemUserId(): Promise<string> {
  const config = readSystemUserConfig();
  if (!config) {
    throw new Error(
      "Set SYSTEM_USER_CLERK_ID (Clerk user_…) or SYSTEM_USER_ID (internal users.id)",
    );
  }

  if (config.kind === "clerk") {
    const user = await prisma.user.findUnique({
      where: { clerkId: config.clerkId },
      select: { id: true },
    });
    if (!user) {
      throw new Error(
        `No app user for SYSTEM_USER_CLERK_ID=${config.clerkId}. Sign in once so Clerk sync creates the row.`,
      );
    }
    return user.id;
  }

  await ensureSyntheticSystemUser(config.userId);
  return config.userId;
}
