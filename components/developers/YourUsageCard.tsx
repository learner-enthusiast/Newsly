import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FeatureUsage, UsageFeature } from "@/lib/usage/queries";
import { LineChart, MessageSquare, Newspaper, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const FEATURES: Record<UsageFeature, { label: string; icon: LucideIcon }> = {
  news: { label: "News briefings", icon: Newspaper },
  research: { label: "Research reports", icon: LineChart },
  chat: { label: "Chat", icon: MessageSquare },
  other: { label: "Other", icon: Sparkles },
};

function n(value: number): string {
  return value.toLocaleString("en-IN");
}

/** The signed-in user's own research activity this month, in product terms. */
export function YourUsageCard({ usage }: { usage: FeatureUsage[] }) {
  // "Other" (e.g. location lookups) only shows when it has activity.
  const rows = usage.filter((row) => row.feature !== "other" || row.searches + row.pagesRead > 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your research activity this month</CardTitle>
        <CardDescription>
          Web searches run and pages read on your behalf, across the app and the API. Resets
          on the 1st (IST).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 sm:grid-cols-3">
          {rows.map((row) => {
            const { label, icon: Icon } = FEATURES[row.feature];
            return (
              <li
                key={row.feature}
                className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card p-4"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Icon className="size-4 text-muted-foreground" />
                  {label}
                </span>
                <dl className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col-reverse">
                    <dt className="text-xs text-muted-foreground">searches</dt>
                    <dd className="font-display text-2xl tabular-nums">{n(row.searches)}</dd>
                  </div>
                  <div className="flex flex-col-reverse">
                    <dt className="text-xs text-muted-foreground">pages read</dt>
                    <dd className="font-display text-2xl tabular-nums">{n(row.pagesRead)}</dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
