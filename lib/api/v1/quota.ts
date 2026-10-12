import { prisma } from "@/db";

/**
 * Accepted pipeline jobs for a user since `since`: API jobs that started a
 * pipeline. Deduplicated briefings and idempotent replays create no new row,
 * so they never count.
 */
export function countAcceptedPipelineJobsSince(userId: string, since: Date): Promise<number> {
  return prisma.apiJob.count({
    where: { userId, deduplicated: false, createdAt: { gte: since } },
  });
}
