import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";

/** Clerk user ids from `ADMIN_CLERK_IDS` (comma- or whitespace-separated). */
function adminClerkIds(): Set<string> {
  return new Set(
    (process.env.ADMIN_CLERK_IDS ?? "")
      .split(/[\s,]+/)
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export function isAdminClerkId(clerkId: string | null | undefined): boolean {
  return Boolean(clerkId) && adminClerkIds().has(clerkId as string);
}

/**
 * Server-side admin gate for pages. Anyone else — signed out or not on the
 * allowlist — gets a 404, so the page's existence isn't revealed.
 */
export async function requireAdminOr404(): Promise<string> {
  const { userId } = await auth();
  if (!userId || !isAdminClerkId(userId)) {
    notFound();
  }
  return userId;
}
