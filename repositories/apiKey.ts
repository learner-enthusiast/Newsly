import type { ApiKey } from "@/db/generated/client";
import { prisma } from "@/db";

export type ApiKeyWrite = {
  userId: string;
  name: string;
  prefix: string;
  hashedKey: string;
  scopes: string[];
  expiresAt: Date | null;
};

/** Keys that still count toward the per-user cap: not revoked, not expired. */
function activeKeyWhere(userId: string, now: Date) {
  return {
    userId,
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

export function listApiKeysByUserId(userId: string): Promise<ApiKey[]> {
  return prisma.apiKey.findMany({
    where: { userId },
    orderBy: [{ revokedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
  });
}

/**
 * Insert a key unless the user already has `maxActiveKeys` active ones.
 * Serializable so two concurrent creates can't both pass the count.
 */
export async function createApiKeyWithinLimit(
  data: ApiKeyWrite,
  maxActiveKeys: number,
): Promise<ApiKey | null> {
  return prisma.$transaction(
    async (tx) => {
      const active = await tx.apiKey.count({
        where: activeKeyWhere(data.userId, new Date()),
      });
      if (active >= maxActiveKeys) {
        return null;
      }
      return tx.apiKey.create({ data });
    },
    { isolationLevel: "Serializable" },
  );
}

/** Revoke an owned key. Returns false when it doesn't exist or isn't the user's. */
export async function revokeApiKeyForUser(
  userId: string,
  apiKeyId: string,
): Promise<boolean> {
  const result = await prisma.apiKey.updateMany({
    where: { id: apiKeyId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count > 0) {
    return true;
  }
  // Already revoked still counts as success for its owner.
  const owned = await prisma.apiKey.count({ where: { id: apiKeyId, userId } });
  return owned > 0;
}

export function findApiKeyByHash(hashedKey: string): Promise<ApiKey | null> {
  return prisma.apiKey.findUnique({ where: { hashedKey } });
}

export async function touchApiKeyLastUsed(apiKeyId: string, at: Date) {
  await prisma.apiKey.update({
    where: { id: apiKeyId },
    data: { lastUsedAt: at },
  });
}

export type ApiKeyUsageCounts = {
  requestsToday: number;
  requestsThisMonth: number;
  pipelineJobsToday: number;
};

/** Per-key request counts since `dayStart` / `monthStart` (UTC). */
export async function countApiUsageByKey(input: {
  userId: string;
  dayStart: Date;
  monthStart: Date;
}): Promise<Map<string, ApiKeyUsageCounts>> {
  const [month, day, pipeline] = await Promise.all([
    prisma.apiRequestLog.groupBy({
      by: ["apiKeyId"],
      where: { userId: input.userId, createdAt: { gte: input.monthStart } },
      _count: { _all: true },
    }),
    prisma.apiRequestLog.groupBy({
      by: ["apiKeyId"],
      where: { userId: input.userId, createdAt: { gte: input.dayStart } },
      _count: { _all: true },
    }),
    // Accepted pipeline jobs answer 202.
    prisma.apiRequestLog.groupBy({
      by: ["apiKeyId"],
      where: {
        userId: input.userId,
        createdAt: { gte: input.dayStart },
        costClass: "pipeline",
        status: 202,
      },
      _count: { _all: true },
    }),
  ]);

  const usage = new Map<string, ApiKeyUsageCounts>();
  const entry = (apiKeyId: string) => {
    let row = usage.get(apiKeyId);
    if (!row) {
      row = { requestsToday: 0, requestsThisMonth: 0, pipelineJobsToday: 0 };
      usage.set(apiKeyId, row);
    }
    return row;
  };
  for (const row of month) entry(row.apiKeyId).requestsThisMonth = row._count._all;
  for (const row of day) entry(row.apiKeyId).requestsToday = row._count._all;
  for (const row of pipeline) entry(row.apiKeyId).pipelineJobsToday = row._count._all;
  return usage;
}
