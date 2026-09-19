import { auth, currentUser } from "@clerk/nextjs/server";
import { upsertUserFromClerk } from "@/repositories/user";

export async function getAuthenticatedUser() {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  const clerkUser = await currentUser();

  if (!clerkUser) {
    return null;
  }

  return upsertUserFromClerk(clerkUser);
}

export async function requireAuthenticatedUser() {
  const user = await getAuthenticatedUser();

  if (!user) {
    return null;
  }

  return user;
}
