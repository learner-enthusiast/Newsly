import { prisma } from "@/db";

/**
 * Accepted pipeline jobs (202 answers on pipeline endpoints) for a user since
 * `since`. The Developers page counts the same rows, so both always agree.
 */
export function countAcceptedPipelineJobsSince(userId: string, since: Date): Promise<number> {
  return prisma.apiRequestLog.count({
    where: { userId, costClass: "pipeline", status: 202, createdAt: { gte: since } },
  });
}
