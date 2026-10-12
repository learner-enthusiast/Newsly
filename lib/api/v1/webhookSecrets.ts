/** Per-user webhook signing secrets (shown and rotated on the Developers page). */

import { prisma } from "@/db";
import { generateWebhookSecret } from "@/lib/api/v1/webhooks";

export async function getOrCreateWebhookSecret(userId: string): Promise<{
  secret: string;
  createdAt: Date;
  rotatedAt: Date | null;
}> {
  return prisma.apiWebhookSecret.upsert({
    where: { userId },
    create: { userId, secret: generateWebhookSecret() },
    update: {},
    select: { secret: true, createdAt: true, rotatedAt: true },
  });
}

/** New secret; webhooks signed after this use it. */
export async function rotateWebhookSecret(userId: string) {
  const secret = generateWebhookSecret();
  return prisma.apiWebhookSecret.upsert({
    where: { userId },
    create: { userId, secret },
    update: { secret, rotatedAt: new Date() },
    select: { secret: true, createdAt: true, rotatedAt: true },
  });
}
