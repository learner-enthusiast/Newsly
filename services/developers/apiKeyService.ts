/**
 * API key management for the Developers page (Clerk-authenticated callers).
 * Pro is checked here, on the server, for every create — never only in the UI.
 */

import { Prisma, type ApiKey } from "@/db/generated/client";
import { getApiPlanLimits, getProApiLimits } from "@/lib/api/v1/limits";
import { generateApiKey } from "@/lib/api/v1/keys";
import {
  API_KEY_EXPIRY_OPTIONS,
  API_SCOPES,
  type ApiKeyStatus,
  type ApiScope,
  type DevelopersPayload,
  type SerializedApiKey,
} from "@/lib/api/v1/scopes";
import { getUserPlan, type PlanTier } from "@/lib/billing/plan";
import {
  countApiUsageByKey,
  createApiKeyWithinLimit,
  listApiKeysByUserId,
  revokeApiKeyForUser,
  type ApiKeyUsageCounts,
} from "@/repositories/apiKey";
import { z } from "zod";

const DAY_MS = 24 * 60 * 60 * 1000;

export const createApiKeyBodySchema = z
  .object({
    name: z.string().trim().min(1, "Give the key a name").max(60),
    scopes: z
      .array(z.enum(API_SCOPES))
      .min(1, "Pick at least one scope")
      .transform((scopes) => [...new Set(scopes)]),
    expiresInDays: z.enum(API_KEY_EXPIRY_OPTIONS),
  })
  .strict();

export type CreateApiKeyBody = z.infer<typeof createApiKeyBodySchema>;

export class ApiKeyPlanError extends Error {}
export class ApiKeyLimitError extends Error {}

export function apiKeyStatus(
  key: Pick<ApiKey, "revokedAt" | "expiresAt">,
  plan: PlanTier,
  now: Date = new Date(),
): ApiKeyStatus {
  if (key.revokedAt) {
    return "revoked";
  }
  if (key.expiresAt && key.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  return plan === "pro" ? "active" : "suspended";
}

function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function utcMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

const ZERO_USAGE: ApiKeyUsageCounts = {
  requestsToday: 0,
  requestsThisMonth: 0,
  pipelineJobsToday: 0,
};

function serializeApiKey(
  key: ApiKey,
  plan: PlanTier,
  usage: ApiKeyUsageCounts,
): SerializedApiKey {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    scopes: key.scopes.filter((s): s is ApiScope =>
      (API_SCOPES as readonly string[]).includes(s),
    ),
    status: apiKeyStatus(key, plan),
    createdAt: key.createdAt.toISOString(),
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
    usage,
  };
}

/** Plan, limits, per-key usage and the key list for the Developers page. */
export async function getDevelopersPayload(userId: string): Promise<DevelopersPayload> {
  const now = new Date();
  const [plan, keys, usageByKey] = await Promise.all([
    getUserPlan(userId),
    listApiKeysByUserId(userId),
    countApiUsageByKey({
      userId,
      dayStart: utcDayStart(now),
      monthStart: utcMonthStart(now),
    }),
  ]);

  const serialized = keys.map((key) =>
    serializeApiKey(key, plan, usageByKey.get(key.id) ?? ZERO_USAGE),
  );
  const usage = serialized.reduce(
    (total, key) => ({
      requestsToday: total.requestsToday + key.usage.requestsToday,
      requestsThisMonth: total.requestsThisMonth + key.usage.requestsThisMonth,
      pipelineJobsToday: total.pipelineJobsToday + key.usage.pipelineJobsToday,
    }),
    ZERO_USAGE,
  );

  return {
    plan,
    limits: getApiPlanLimits(plan) ?? getProApiLimits(),
    usage,
    keys: serialized,
  };
}

/**
 * Create a key and return the full secret — the only time it exists outside
 * the caller's hands. Throws `ApiKeyPlanError` / `ApiKeyLimitError`.
 */
export async function createApiKeyForUser(
  userId: string,
  body: CreateApiKeyBody,
): Promise<{ key: string; apiKey: SerializedApiKey }> {
  const plan = await getUserPlan(userId);
  const limits = getApiPlanLimits(plan);
  if (!limits) {
    throw new ApiKeyPlanError("The Newsly API requires an active Pro plan.");
  }

  const expiresAt =
    body.expiresInDays === "never"
      ? null
      : new Date(Date.now() + Number(body.expiresInDays) * DAY_MS);

  // The 12-char display prefix carries only 4 random chars, so a unique clash
  // is possible; a serializable conflict with a parallel create is too.
  for (let attempt = 1; ; attempt += 1) {
    const { key, prefix, hashedKey } = generateApiKey();
    try {
      const created = await createApiKeyWithinLimit(
        { userId, name: body.name, prefix, hashedKey, scopes: body.scopes, expiresAt },
        limits.maxActiveKeys,
      );
      if (!created) {
        throw new ApiKeyLimitError(
          `You can have at most ${limits.maxActiveKeys} active keys. Revoke one first.`,
        );
      }
      return { key, apiKey: serializeApiKey(created, plan, ZERO_USAGE) };
    } catch (error) {
      if (attempt >= CREATE_ATTEMPTS || !isRetryableCreateError(error)) {
        throw error;
      }
    }
  }
}

const CREATE_ATTEMPTS = 3;

function isRetryableCreateError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

/** Revoking works on any plan, so lapsed users can still clean up. */
export function revokeApiKey(userId: string, apiKeyId: string): Promise<boolean> {
  return revokeApiKeyForUser(userId, apiKeyId);
}
