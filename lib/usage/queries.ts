/**
 * Read side of provider usage. Every query is bounded by `created_at` and
 * rides an index: `(created_at)` for all-user ranges, `(user_id, created_at)`
 * for one user, `(run_id)` for a run. Days are bucketed in Asia/Kolkata.
 */

import { prisma } from "@/db";
import type { UsageProvider, UsageReason } from "@/db/generated/client";
import { istDaysAgoStart, istLastDateKeys, USAGE_TIME_ZONE } from "@/lib/usage/istTime";

export type DateRange = { from: Date; to: Date };

export type ProviderTotal = {
  provider: UsageProvider;
  credits: number;
  requests: number;
};

export const USAGE_PROVIDERS: UsageProvider[] = ["serpapi", "firecrawl"];

/** Credits and request count per provider in a range (both providers always present). */
export async function getProviderTotals(range: DateRange): Promise<ProviderTotal[]> {
  const rows = await prisma.providerUsage.groupBy({
    by: ["provider"],
    where: { createdAt: { gte: range.from, lt: range.to } },
    _sum: { credits: true },
    _count: { _all: true },
  });
  return USAGE_PROVIDERS.map((provider) => {
    const row = rows.find((r) => r.provider === provider);
    return {
      provider,
      credits: row?._sum.credits ?? 0,
      requests: row?._count._all ?? 0,
    };
  });
}

export type DailyCredits = {
  /** IST date, "YYYY-MM-DD". */
  day: string;
  serpapi: number;
  firecrawl: number;
};

/** Credits per IST day per provider for the last `days` days (zero-filled). */
export async function getDailyCredits(days: number, now: Date = new Date()): Promise<DailyCredits[]> {
  const keys = istLastDateKeys(days, now);
  const from = istDaysAgoStart(days - 1, now);
  const rows = await prisma.$queryRaw<
    Array<{ day: string; provider: UsageProvider; credits: number }>
  >`
    SELECT to_char((created_at AT TIME ZONE ${USAGE_TIME_ZONE})::date, 'YYYY-MM-DD') AS day,
           provider,
           SUM(credits)::int AS credits
    FROM provider_usage
    WHERE created_at >= ${from} AND created_at < ${now}
    GROUP BY 1, 2
  `;
  const byDay = new Map(keys.map((day) => [day, { day, serpapi: 0, firecrawl: 0 }]));
  for (const row of rows) {
    const entry = byDay.get(row.day);
    if (entry) {
      entry[row.provider] = row.credits;
    }
  }
  return [...byDay.values()];
}

export type TopUserRow = {
  userId: string;
  email: string | null;
  name: string | null;
  credits: number;
  serpapiCredits: number;
  firecrawlCredits: number;
  requests: number;
};

/** Users ranked by credits in a range, paginated. System rows (no user) are excluded. */
export async function getTopUsers(input: {
  range: DateRange;
  page: number;
  pageSize: number;
}): Promise<{ rows: TopUserRow[]; total: number }> {
  const offset = (input.page - 1) * input.pageSize;
  const [rows, totals] = await Promise.all([
    prisma.$queryRaw<
      Array<{
        user_id: string;
        credits: number;
        serpapi_credits: number;
        firecrawl_credits: number;
        requests: number;
      }>
    >`
      SELECT user_id,
             SUM(credits)::int AS credits,
             COALESCE(SUM(credits) FILTER (WHERE provider = 'serpapi'), 0)::int AS serpapi_credits,
             COALESCE(SUM(credits) FILTER (WHERE provider = 'firecrawl'), 0)::int AS firecrawl_credits,
             COUNT(*)::int AS requests
      FROM provider_usage
      WHERE created_at >= ${input.range.from} AND created_at < ${input.range.to}
        AND user_id IS NOT NULL
      GROUP BY user_id
      ORDER BY credits DESC, user_id
      LIMIT ${input.pageSize} OFFSET ${offset}
    `,
    prisma.$queryRaw<Array<{ total: number }>>`
      SELECT COUNT(DISTINCT user_id)::int AS total
      FROM provider_usage
      WHERE created_at >= ${input.range.from} AND created_at < ${input.range.to}
        AND user_id IS NOT NULL
    `,
  ]);

  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.user_id) } },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  return {
    total: totals[0]?.total ?? 0,
    rows: rows.map((row) => {
      const user = byId.get(row.user_id);
      const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
      return {
        userId: row.user_id,
        email: user?.email ?? null,
        name: name || null,
        credits: row.credits,
        serpapiCredits: row.serpapi_credits,
        firecrawlCredits: row.firecrawl_credits,
        requests: row.requests,
      };
    }),
  };
}

export type BreakdownRow = {
  key: string;
  serpapi: number;
  firecrawl: number;
  credits: number;
  requests: number;
};

/** Credits by workflow or by source in a range, largest first. */
export async function getUsageBreakdown(
  dimension: "workflow" | "source",
  range: DateRange,
): Promise<BreakdownRow[]> {
  const rows = await prisma.providerUsage.groupBy({
    by: [dimension, "provider"],
    where: { createdAt: { gte: range.from, lt: range.to } },
    _sum: { credits: true },
    _count: { _all: true },
  });
  const merged = new Map<string, BreakdownRow>();
  for (const row of rows) {
    const key = (dimension === "workflow" ? row.workflow : row.source) ?? "(none)";
    const entry = merged.get(key) ?? { key, serpapi: 0, firecrawl: 0, credits: 0, requests: 0 };
    const credits = row._sum.credits ?? 0;
    entry[row.provider] += credits;
    entry.credits += credits;
    entry.requests += row._count._all;
    merged.set(key, entry);
  }
  return [...merged.values()].sort((a, b) => b.credits - a.credits);
}

export const RUN_ROWS_LIMIT = 500;

/** Every usage row of one run, in order (capped). */
export function getRunUsageRows(runId: string) {
  return prisma.providerUsage.findMany({
    where: { runId },
    orderBy: { createdAt: "asc" },
    take: RUN_ROWS_LIMIT,
    select: {
      id: true,
      createdAt: true,
      provider: true,
      operation: true,
      userId: true,
      source: true,
      workflow: true,
      editionId: true,
      environment: true,
      credits: true,
      billable: true,
      reason: true,
      httpStatus: true,
      durationMs: true,
      detail: true,
    },
  });
}

/** Sum of credits for one provider in this environment (reconcile cron). */
export async function sumProviderCredits(input: {
  provider: UsageProvider;
  environment: string;
  range: DateRange;
}): Promise<number> {
  const result = await prisma.providerUsage.aggregate({
    where: {
      provider: input.provider,
      environment: input.environment,
      createdAt: { gte: input.range.from, lt: input.range.to },
    },
    _sum: { credits: true },
  });
  return result._sum.credits ?? 0;
}

export function getRecentReconciliations(limit = 14) {
  return prisma.usageReconciliation.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });
}

// ── A user's own usage, in product terms ────────────────────────────────────

export type UsageFeature = "news" | "research" | "chat" | "other";

export type FeatureUsage = {
  feature: UsageFeature;
  /** Web searches run (SerpApi requests that reached the provider). */
  searches: number;
  /** Web pages read (Firecrawl scrapes that returned a document). */
  pagesRead: number;
};

const WORKFLOW_FEATURE: Record<string, UsageFeature> = {
  News: "news",
  "News rerun": "news",
  "Stock research": "research",
  Chat: "chat",
};

const SEARCH_REASONS: UsageReason[] = ["charged", "cached", "timeout_assumed"];

/** One user's searches and pages read by feature (no providers, no credits). */
export async function getUserFeatureUsage(
  userId: string,
  range: DateRange,
): Promise<FeatureUsage[]> {
  const rows = await prisma.providerUsage.groupBy({
    by: ["workflow", "provider", "reason"],
    where: { userId, createdAt: { gte: range.from, lt: range.to } },
    _count: { _all: true },
  });
  const features: Record<UsageFeature, FeatureUsage> = {
    news: { feature: "news", searches: 0, pagesRead: 0 },
    research: { feature: "research", searches: 0, pagesRead: 0 },
    chat: { feature: "chat", searches: 0, pagesRead: 0 },
    other: { feature: "other", searches: 0, pagesRead: 0 },
  };
  for (const row of rows) {
    const feature = WORKFLOW_FEATURE[row.workflow ?? ""] ?? "other";
    if (row.provider === "serpapi" && SEARCH_REASONS.includes(row.reason)) {
      features[feature].searches += row._count._all;
    }
    if (row.provider === "firecrawl" && row.reason === "charged") {
      features[feature].pagesRead += row._count._all;
    }
  }
  return Object.values(features);
}
