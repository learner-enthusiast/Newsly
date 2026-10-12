"use client";

import { CreateApiKeyDialog } from "@/components/developers/CreateApiKeyDialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import type {
  ApiKeyStatus,
  DevelopersPayload,
  SerializedApiKey,
} from "@/lib/api/v1/scopes";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Building2,
  KeyRound,
  LineChart,
  Mail,
  Newspaper,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

const DOCS_HREF = "/docs/api";

const STATUS_LABEL: Record<ApiKeyStatus, string> = {
  active: "Active",
  revoked: "Revoked",
  expired: "Expired",
  suspended: "Suspended — Pro required",
};

const STATUS_CLASS: Record<ApiKeyStatus, string> = {
  active: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400",
  suspended: "bg-accent/40 text-accent-foreground",
  revoked: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
};

const API_FEATURES = [
  {
    icon: Newspaper,
    title: "News briefings & story feed",
    detail: "Generate source-backed briefings for any city or topic, and read the public story feed.",
  },
  {
    icon: LineChart,
    title: "Stock, ETF & mutual fund research",
    detail: "Start analyst-style research reports on Indian instruments and fetch them when ready.",
  },
  {
    icon: Search,
    title: "Instrument search",
    detail: "Look up NSE and BSE stocks, ETFs and listed fund units by name or symbol.",
  },
  {
    icon: Mail,
    title: "Newsletters",
    detail: "Create, schedule, pause and manage your email newsletters from code.",
  },
] as const;

function formatDate(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatRelative(iso: string | null): string {
  if (!iso) {
    return "Never";
  }
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return formatDate(iso);
}

export function DevelopersClient({ initial }: { initial: DevelopersPayload }) {
  const [data, setData] = useState(initial);
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<SerializedApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);

  const isPro = data.plan === "pro";
  const activeKeyCount = data.keys.filter((k) => k.status === "active").length;
  const atKeyLimit = activeKeyCount >= data.limits.maxActiveKeys;

  async function reload() {
    try {
      const response = await fetch("/api/developers/keys");
      if (response.ok) {
        setData((await response.json()) as DevelopersPayload);
      }
    } catch {
      // Keep showing the last good state.
    }
  }

  async function confirmRevoke() {
    if (!revokeTarget) {
      return;
    }
    setRevoking(true);
    try {
      const response = await fetch(`/api/developers/keys/${revokeTarget.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Failed to revoke key");
      }
      toast.success(`Revoked “${revokeTarget.name}”`);
      setRevokeTarget(null);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to revoke key");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-8 md:px-8 md:py-12">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Badge variant={isPro ? "accent" : "outline"}>
                {isPro ? "Pro plan" : "Free plan"}
              </Badge>
            </div>
            <h1 className="font-display text-3xl tracking-tight">Developers</h1>
            <p className="max-w-2xl text-muted-foreground">
              Use the Dainik Samachar API to call briefings, research, instrument
              search and newsletters from your own code.
            </p>
          </div>
          <Link
            href={DOCS_HREF}
            className={buttonVariants({ variant: "outline" })}
          >
            <BookOpen data-icon="inline-start" />
            API docs
          </Link>
        </header>

        {isPro ? (
          <UsagePanel data={data} />
        ) : (
          <UpgradeCard data={data} />
        )}

        {isPro || data.keys.length > 0 ? (
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="size-4" />
                  API keys
                </CardTitle>
                <CardDescription>
                  {isPro
                    ? `${activeKeyCount} of ${data.limits.maxActiveKeys} active keys. Send as “Authorization: Bearer <key>”.`
                    : "Your keys are kept but suspended. They start working again as soon as you renew Pro."}
                </CardDescription>
              </div>
              <Button
                type="button"
                onClick={() => setCreateOpen(true)}
                disabled={!isPro || atKeyLimit}
                title={
                  !isPro
                    ? "Requires an active Pro plan"
                    : atKeyLimit
                      ? "Revoke a key to create another"
                      : undefined
                }
              >
                <Plus data-icon="inline-start" />
                Create key
              </Button>
            </CardHeader>
            <CardContent>
              {data.keys.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center">
                  <KeyRound className="size-6 text-muted-foreground" />
                  <p className="font-medium">No keys yet</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Create a key, then follow the quickstart in the docs to make
                    your first request.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col divide-y divide-border/60">
                  {data.keys.map((key) => (
                    <ApiKeyRow
                      key={key.id}
                      apiKey={key}
                      onRevoke={() => setRevokeTarget(key)}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <CreateApiKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void reload()}
      />

      <Dialog
        open={revokeTarget !== null}
        onOpenChange={(open) => !open && !revoking && setRevokeTarget(null)}
      >
        <DialogContent showCloseButton className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke “{revokeTarget?.name}”?</DialogTitle>
            <DialogDescription>
              Requests using{" "}
              <span className="font-mono">{revokeTarget?.prefix}…</span> will
              fail with 401 immediately. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevokeTarget(null)}
              disabled={revoking}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmRevoke()}
              disabled={revoking}
            >
              {revoking ? <Spinner data-icon="inline-start" /> : null}
              Revoke key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ApiKeyRow({
  apiKey,
  onRevoke,
}: {
  apiKey: SerializedApiKey;
  onRevoke: () => void;
}) {
  const inactive = apiKey.status === "revoked" || apiKey.status === "expired";
  return (
    <li className={cn("flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between", inactive && "opacity-60")}>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{apiKey.name}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {apiKey.prefix}…
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              STATUS_CLASS[apiKey.status],
            )}
          >
            {STATUS_LABEL[apiKey.status]}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {apiKey.scopes.map((scope) => (
            <Badge key={scope} variant="outline" className="font-mono">
              {scope}
            </Badge>
          ))}
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
          <div>
            <dt>Created</dt>
            <dd className="text-foreground">{formatDate(apiKey.createdAt)}</dd>
          </div>
          <div>
            <dt>Last used</dt>
            <dd className="text-foreground">{formatRelative(apiKey.lastUsedAt)}</dd>
          </div>
          <div>
            <dt>{apiKey.status === "revoked" ? "Revoked" : "Expires"}</dt>
            <dd className="text-foreground">
              {apiKey.status === "revoked"
                ? formatDate(apiKey.revokedAt)
                : apiKey.expiresAt
                  ? formatDate(apiKey.expiresAt)
                  : "Never"}
            </dd>
          </div>
          <div>
            <dt>Requests today / month</dt>
            <dd className="text-foreground">
              {apiKey.usage.requestsToday} / {apiKey.usage.requestsThisMonth}
            </dd>
          </div>
        </dl>
      </div>
      {apiKey.status !== "revoked" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRevoke}
          className="shrink-0 self-start"
        >
          Revoke
        </Button>
      ) : null}
    </li>
  );
}

function UsagePanel({ data }: { data: DevelopersPayload }) {
  const { usage, limits } = data;
  const quotaPercent = Math.min(
    100,
    Math.round((usage.pipelineJobsToday / limits.pipelineJobsPerDay) * 100),
  );
  return (
    <section className="grid gap-3 sm:grid-cols-3">
      <StatTile label="Requests today" value={usage.requestsToday.toLocaleString("en-IN")}>
        Up to {limits.requestsPerMinute} per minute per key
      </StatTile>
      <StatTile
        label="Requests this month"
        value={usage.requestsThisMonth.toLocaleString("en-IN")}
      >
        Across all keys
      </StatTile>
      <StatTile
        label="Pipeline jobs today"
        value={`${usage.pipelineJobsToday} / ${limits.pipelineJobsPerDay}`}
      >
        <Progress value={quotaPercent} className="mt-1" />
        <span className="mt-1.5 block">Briefings + research · resets 00:00 UTC</span>
      </StatTile>
    </section>
  );
}

function StatTile({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-card p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-display text-2xl tabular-nums">{value}</span>
      <div className="text-xs text-muted-foreground">{children}</div>
    </div>
  );
}

function UpgradeCard({ data }: { data: DevelopersPayload }) {
  const { limits } = data;
  return (
    <Card className="ring-accent/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="size-4" />
          The API is a Pro feature
        </CardTitle>
        <CardDescription>
          Upgrade to create API keys and call Dainik Samachar from your own
          scripts, bots and dashboards. The docs are open to everyone.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <ul className="grid gap-4 sm:grid-cols-2">
          {API_FEATURES.map(({ icon: Icon, title, detail }) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/30">
                <Icon className="size-4" />
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{title}</span>
                <span className="text-sm text-muted-foreground">{detail}</span>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-md bg-muted/40 px-4 py-3 text-sm">
          <span className="flex items-center gap-1.5">
            <Building2 className="size-4 text-muted-foreground" />
            Pro limits:
          </span>
          <span>{limits.requestsPerMinute} requests / min</span>
          <span>{limits.pipelineJobsPerDay} pipeline jobs / day</span>
          <span>{limits.maxActiveKeys} active keys</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/pricing" className={buttonVariants({ variant: "brand-accent" })}>
            <Sparkles data-icon="inline-start" />
            Upgrade to Pro
          </Link>
          <Link href={DOCS_HREF} className={buttonVariants({ variant: "outline" })}>
            <BookOpen data-icon="inline-start" />
            Read the API docs
          </Link>
          <Button type="button" variant="ghost" disabled>
            <Plus data-icon="inline-start" />
            Create key
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
