import { DailyCreditsChart } from "@/components/admin/DailyCreditsChart";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireAdminOr404 } from "@/lib/admin";
import { istDayStart, istMonthStart } from "@/lib/usage/istTime";
import {
  getDailyCredits,
  getProviderTotals,
  getRecentReconciliations,
  getRunUsageRows,
  getTopUsers,
  getUsageBreakdown,
  RUN_ROWS_LIMIT,
  type BreakdownRow,
  type ProviderTotal,
} from "@/lib/usage/queries";
import { usageEnvironment } from "@/lib/usage/recorder";
import { reconcileAlertsEnabled } from "@/services/usage/reconcileProviderUsage";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Provider usage — Admin",
  robots: { index: false },
};

const USERS_PAGE_SIZE = 20;

const PROVIDER_LABEL = { serpapi: "SerpApi", firecrawl: "Firecrawl" } as const;

function n(value: number): string {
  return value.toLocaleString("en-IN");
}

function istDateTime(date: Date): string {
  return date.toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdminOr404();

  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(firstParam(params.page) ?? "1", 10) || 1);
  const runId = firstParam(params.runId)?.trim() || null;

  const now = new Date();
  const today = { from: istDayStart(now), to: now };
  const month = { from: istMonthStart(now), to: now };

  const [totalsToday, totalsMonth, daily, users, byWorkflow, bySource, reconciliations, runRows] =
    await Promise.all([
      getProviderTotals(today),
      getProviderTotals(month),
      getDailyCredits(30, now),
      getTopUsers({ range: month, page, pageSize: USERS_PAGE_SIZE }),
      getUsageBreakdown("workflow", month),
      getUsageBreakdown("source", month),
      getRecentReconciliations(14),
      runId ? getRunUsageRows(runId) : Promise.resolve(null),
    ]);

  const totalPages = Math.max(1, Math.ceil(users.total / USERS_PAGE_SIZE));
  const pageHref = (p: number) => `/admin/usage?page=${p}${runId ? `&runId=${encodeURIComponent(runId)}` : ""}`;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 md:px-8">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-3xl tracking-tight">Provider usage</h1>
          <p className="text-sm text-muted-foreground">
            SerpApi and Firecrawl credits recorded in <span className="font-mono">{usageEnvironment()}</span>.
            Days and months are Asia/Kolkata. Updated {istDateTime(now)} IST.
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TotalTile label="today" totals={totalsToday} provider="serpapi" />
          <TotalTile label="this month" totals={totalsMonth} provider="serpapi" />
          <TotalTile label="today" totals={totalsToday} provider="firecrawl" />
          <TotalTile label="this month" totals={totalsMonth} provider="firecrawl" />
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Last 30 days</CardTitle>
          </CardHeader>
          <CardContent>
            <DailyCreditsChart data={daily} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top users this month</CardTitle>
            <CardDescription>
              {n(users.total)} users with recorded usage. System spend (cron, editions, scripts) is
              in the source breakdown.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-normal">#</th>
                    <th className="py-2 pr-3 font-normal">User</th>
                    <th className="py-2 pr-3 text-right font-normal">SerpApi</th>
                    <th className="py-2 pr-3 text-right font-normal">Firecrawl</th>
                    <th className="py-2 pr-3 text-right font-normal">Credits</th>
                    <th className="py-2 text-right font-normal">Requests</th>
                  </tr>
                </thead>
                <tbody>
                  {users.rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-muted-foreground">
                        No user usage this month.
                      </td>
                    </tr>
                  ) : (
                    users.rows.map((row, index) => (
                      <tr key={row.userId} className="border-t border-border/40">
                        <td className="py-2 pr-3 text-muted-foreground">
                          {(page - 1) * USERS_PAGE_SIZE + index + 1}
                        </td>
                        <td className="py-2 pr-3">
                          <div className="font-medium">{row.name ?? row.email ?? row.userId}</div>
                          {row.name && row.email ? (
                            <div className="text-xs text-muted-foreground">{row.email}</div>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3 text-right">{n(row.serpapiCredits)}</td>
                        <td className="py-2 pr-3 text-right">{n(row.firecrawlCredits)}</td>
                        <td className="py-2 pr-3 text-right font-medium">{n(row.credits)}</td>
                        <td className="py-2 text-right text-muted-foreground">{n(row.requests)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 ? (
              <nav className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <Link
                    href={pageHref(page - 1)}
                    aria-disabled={page <= 1}
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      page <= 1 && "pointer-events-none opacity-50",
                    )}
                  >
                    Previous
                  </Link>
                  <Link
                    href={pageHref(page + 1)}
                    aria-disabled={page >= totalPages}
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      page >= totalPages && "pointer-events-none opacity-50",
                    )}
                  >
                    Next
                  </Link>
                </div>
              </nav>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <BreakdownCard title="By workflow this month" rows={byWorkflow} />
          <BreakdownCard
            title="By source this month"
            description="web, web-anon, chat, api, newsletter, cron, script"
            rows={bySource}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Reconciliation</CardTitle>
            <CardDescription>
              Daily at 06:00 IST: our recorded credits vs. the provider&apos;s own usage figures.{" "}
              {reconcileAlertsEnabled()
                ? "Alerts are on for drift above 5%."
                : "Alerts are off (USAGE_RECONCILE_ALERTS): provider keys are shared, so provider totals include other environments."}
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-normal">Date (IST)</th>
                  <th className="py-2 pr-3 font-normal">Provider</th>
                  <th className="py-2 pr-3 font-normal">Env</th>
                  <th className="py-2 pr-3 text-right font-normal">Ours</th>
                  <th className="py-2 pr-3 text-right font-normal">Provider</th>
                  <th className="py-2 pr-3 text-right font-normal">Drift</th>
                  <th className="py-2 font-normal">Note</th>
                </tr>
              </thead>
              <tbody>
                {reconciliations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-muted-foreground">
                      No reconciliation runs yet.
                    </td>
                  </tr>
                ) : (
                  reconciliations.map((row) => (
                    <tr key={row.id} className="border-t border-border/40 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap">{row.date.toISOString().slice(0, 10)}</td>
                      <td className="py-2 pr-3">{PROVIDER_LABEL[row.provider]}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{row.environment}</td>
                      <td className="py-2 pr-3 text-right">{n(row.ourTotal)}</td>
                      <td className="py-2 pr-3 text-right">
                        {row.providerTotal == null ? "—" : n(row.providerTotal)}
                      </td>
                      <td className={cn("py-2 pr-3 text-right", row.alerted && "font-semibold text-destructive")}>
                        {row.driftPct == null ? "—" : `${row.driftPct.toFixed(1)}%`}
                        {row.alerted ? " · alert" : ""}
                      </td>
                      <td className="max-w-md py-2 text-xs text-muted-foreground">{row.note}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Run drill-down</CardTitle>
            <CardDescription>Every provider request recorded for one Neatlogs run id.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form action="/admin/usage" method="get" className="flex gap-2">
              <Input
                name="runId"
                defaultValue={runId ?? ""}
                placeholder="Run id"
                className="max-w-md font-mono text-xs"
              />
              <button type="submit" className={buttonVariants({ variant: "outline" })}>
                Show run
              </button>
            </form>
            {runRows ? (
              runRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No usage recorded for this run.</p>
              ) : (
                <div className="overflow-x-auto">
                  <p className="mb-2 text-sm">
                    {runRows.length} requests ·{" "}
                    <span className="font-medium">
                      {n(runRows.reduce((sum, r) => sum + r.credits, 0))} credits
                    </span>
                    {runRows.length >= RUN_ROWS_LIMIT ? ` (first ${RUN_ROWS_LIMIT} shown)` : ""}
                  </p>
                  <table className="w-full text-xs tabular-nums">
                    <thead className="text-left text-muted-foreground">
                      <tr>
                        <th className="py-1.5 pr-3 font-normal">Time (IST)</th>
                        <th className="py-1.5 pr-3 font-normal">Provider</th>
                        <th className="py-1.5 pr-3 font-normal">Operation</th>
                        <th className="py-1.5 pr-3 text-right font-normal">Credits</th>
                        <th className="py-1.5 pr-3 font-normal">Reason</th>
                        <th className="py-1.5 pr-3 text-right font-normal">ms</th>
                        <th className="py-1.5 font-normal">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runRows.map((row) => (
                        <tr key={row.id} className="border-t border-border/40 align-top">
                          <td className="py-1.5 pr-3 whitespace-nowrap">{istDateTime(row.createdAt)}</td>
                          <td className="py-1.5 pr-3">{PROVIDER_LABEL[row.provider]}</td>
                          <td className="py-1.5 pr-3 font-mono">{row.operation}</td>
                          <td className="py-1.5 pr-3 text-right">{row.credits}</td>
                          <td className="py-1.5 pr-3">{row.reason}</td>
                          <td className="py-1.5 pr-3 text-right text-muted-foreground">{row.durationMs}</td>
                          <td className="max-w-sm py-1.5 font-mono break-all text-muted-foreground">
                            {JSON.stringify(row.detail)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TotalTile({
  label,
  totals,
  provider,
}: {
  label: string;
  totals: ProviderTotal[];
  provider: ProviderTotal["provider"];
}) {
  const row = totals.find((t) => t.provider === provider);
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-card p-4">
      <span className="text-xs text-muted-foreground">
        {PROVIDER_LABEL[provider]} · {label}
      </span>
      <span className="font-display text-2xl tabular-nums">{n(row?.credits ?? 0)}</span>
      <span className="text-xs text-muted-foreground">
        credits · {n(row?.requests ?? 0)} requests
      </span>
    </div>
  );
}

function BreakdownCard({
  title,
  description,
  rows,
}: {
  title: string;
  description?: string;
  rows: BreakdownRow[];
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-3 font-normal">Name</th>
              <th className="py-1.5 pr-3 text-right font-normal">SerpApi</th>
              <th className="py-1.5 pr-3 text-right font-normal">Firecrawl</th>
              <th className="py-1.5 text-right font-normal">Requests</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-center text-muted-foreground">
                  Nothing recorded this month.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.key} className="border-t border-border/40">
                  <td className="py-1.5 pr-3">{row.key}</td>
                  <td className="py-1.5 pr-3 text-right">{n(row.serpapi)}</td>
                  <td className="py-1.5 pr-3 text-right">{n(row.firecrawl)}</td>
                  <td className="py-1.5 text-right text-muted-foreground">{n(row.requests)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
