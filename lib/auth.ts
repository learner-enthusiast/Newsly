import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/db";
import { reconcileExpiredProSubscription } from "@/services/billing/userPlan";
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

  const user = await upsertUserFromClerk(clerkUser);
  await reconcileExpiredProSubscription(user.id);

  return prisma.user.findUnique({
    where: { id: user.id },
    include: {
      subscription: {
        select: {
          status: true,
          currentPeriodEnd: true,
          currentPeriodStart: true,
        },
      },
    },
  });
}

export async function requireAuthenticatedUser() {
  const user = await getAuthenticatedUser();

  if (!user) {
    return null;
  }

  return user;
}
