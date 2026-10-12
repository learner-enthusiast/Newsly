/**
 * Compare the credits we recorded with each provider's own usage figures and
 * store the result (`UsageReconciliation`). Runs daily from the
 * `provider-usage-reconcile` cron.
 *
 * Alerting (console.error) only happens when `USAGE_RECONCILE_ALERTS=true`.
 * While dev and prod share provider keys the provider totals include every
 * environment, so drift is expected and only reported.
 */

import { prisma } from "@/db";
import type { UsageProvider } from "@/db/generated/client";
import { firecrawlClient } from "@/clients/FireCrawlClient";
import { serpClient } from "@/clients/serpCleint";
import { istDateKey } from "@/lib/usage/istTime";
import { sumProviderCredits } from "@/lib/usage/queries";
import { usageEnvironment } from "@/lib/usage/recorder";

export const RECONCILE_DRIFT_THRESHOLD_PCT = 5;

export function reconcileAlertsEnabled(): boolean {
  return process.env.USAGE_RECONCILE_ALERTS === "true";
}

type ProviderFigure = {
  periodStart: Date;
  periodEnd: Date;
  total: number;
  note?: string;
};

export type ReconcileResult = {
  provider: UsageProvider;
  ourTotal: number;
  providerTotal: number | null;
  driftPct: number | null;
  alerted: boolean;
  note: string | null;
};

export function driftPercent(ourTotal: number, providerTotal: number | null): number | null {
  if (providerTotal == null || providerTotal <= 0) {
    return null;
  }
  return Math.round(((providerTotal - ourTotal) / providerTotal) * 10_000) / 100;
}

function utcMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** SerpApi Account API: `this_month_usage` (assumed calendar month, UTC; lags a little). */
async function serpApiFigure(now: Date): Promise<ProviderFigure> {
  const account = (await serpClient.account()) as { this_month_usage?: unknown };
  const total = Number(account.this_month_usage);
  if (!Number.isFinite(total)) {
    throw new Error("SerpApi account response had no this_month_usage");
  }
  return {
    periodStart: utcMonthStart(now),
    periodEnd: now,
    total,
    note: "SerpApi this_month_usage assumed to be the UTC calendar month and can lag by minutes.",
  };
}

/** Firecrawl: credits used in the billing period containing `now`. */
async function firecrawlFigure(now: Date): Promise<ProviderFigure> {
  try {
    const historical = await firecrawlClient.creditUsageHistorical();
    const period = historical.periods.find((p) => {
      const start = p.startDate ? new Date(p.startDate) : null;
      const end = p.endDate ? new Date(p.endDate) : null;
      return start && start <= now && (!end || now < end);
    });
    if (period?.startDate) {
      return { periodStart: new Date(period.startDate), periodEnd: now, total: period.creditsUsed };
    }
  } catch {
    // Fall back to plan − remaining below.
  }
  const usage = await firecrawlClient.creditUsage();
  if (usage.planCredits == null || !usage.billingPeriodStart) {
    throw new Error("Firecrawl credit usage had no plan credits / billing period");
  }
  return {
    periodStart: new Date(usage.billingPeriodStart),
    periodEnd: now,
    total: usage.planCredits - usage.remainingCredits,
    note: "Firecrawl total = plan credits − remaining (historical endpoint unavailable).",
  };
}

const FIGURES: Record<UsageProvider, (now: Date) => Promise<ProviderFigure>> = {
  serpapi: serpApiFigure,
  firecrawl: firecrawlFigure,
};

async function firstRecordedAt(provider: UsageProvider, environment: string) {
  const row = await prisma.providerUsage.findFirst({
    where: { provider, environment },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}

/** Reconcile one provider and upsert today's (IST) row. Never throws on provider API errors. */
export async function reconcileProvider(
  provider: UsageProvider,
  now: Date = new Date(),
): Promise<ReconcileResult> {
  const environment = usageEnvironment();
  const alertsEnabled = reconcileAlertsEnabled();
  const notes: string[] = [];

  let figure: ProviderFigure | null = null;
  try {
    figure = await FIGURES[provider](now);
    if (figure.note) notes.push(figure.note);
  } catch (error) {
    notes.push(
      `Provider usage API failed: ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`,
    );
  }

  const periodStart = figure?.periodStart ?? utcMonthStart(now);
  const ourTotal = await sumProviderCredits({
    provider,
    environment,
    range: { from: periodStart, to: now },
  });
  const providerTotal = figure?.total ?? null;
  const driftPct = driftPercent(ourTotal, providerTotal);

  const firstRow = await firstRecordedAt(provider, environment);
  if (!firstRow || firstRow > periodStart) {
    notes.push(
      `Partial period: tracking began ${firstRow ? firstRow.toISOString() : "after this period"}, so earlier provider usage is not in our total.`,
    );
  }
  if (!alertsEnabled) {
    notes.push(
      "Alerts off (USAGE_RECONCILE_ALERTS != true): provider keys are shared, so provider totals include other environments.",
    );
  }

  const overThreshold = driftPct != null && Math.abs(driftPct) > RECONCILE_DRIFT_THRESHOLD_PCT;
  const alerted = alertsEnabled && overThreshold;
  const summary = `[usage-reconcile] ${provider} (${environment}): ours=${ourTotal} provider=${providerTotal ?? "n/a"} drift=${driftPct ?? "n/a"}%`;
  if (alerted) {
    console.error(`${summary} — ALERT: drift above ${RECONCILE_DRIFT_THRESHOLD_PCT}%`);
  } else {
    console.info(summary);
  }

  const note = notes.join(" ") || null;
  const date = new Date(`${istDateKey(now)}T00:00:00Z`);
  await prisma.usageReconciliation.upsert({
    where: { date_provider_environment: { date, provider, environment } },
    create: {
      date,
      provider,
      environment,
      periodStart,
      periodEnd: now,
      ourTotal,
      providerTotal,
      driftPct,
      note,
      alerted,
    },
    update: {
      periodStart,
      periodEnd: now,
      ourTotal,
      providerTotal,
      driftPct,
      note,
      alerted,
      createdAt: now,
    },
  });

  return { provider, ourTotal, providerTotal, driftPct, alerted, note };
}
