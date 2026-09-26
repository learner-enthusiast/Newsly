"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatDisplayDate,
  formatNewsScopeLabel,
} from "@/services/news/newsRequestProgress";
import {
  displayOrDash,
  formatSourcesFilterLabel,
  formatTopicsLabel,
} from "@/services/news/newsRequestDisplay";
import type { SerializedNewsRequest } from "@/services/news/newsRequestTypes";

type NewsRequestSummaryCardProps = {
  request: SerializedNewsRequest;
  className?: string;
};

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,38%)_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium">{value}</dd>
    </div>
  );
}

export function NewsRequestSummaryCard({
  request,
  className,
}: NewsRequestSummaryCardProps) {
  return (
    <Card size="sm" className={className}>
      <CardHeader className="border-b pb-3">
        <CardTitle className="text-sm">Request summary</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <dl className="flex flex-col gap-3">
          <SummaryRow label="Date" value={formatDisplayDate(request.date)} />
          <SummaryRow
            label="Location"
            value={displayOrDash(request.location)}
          />
          <SummaryRow
            label="Scope"
            value={formatNewsScopeLabel(request.scope)}
          />
          <SummaryRow
            label="Stories"
            value={String(request.storyCount)}
          />
          <SummaryRow
            label="Language"
            value={displayOrDash(request.language)}
          />
          <SummaryRow
            label="Topics"
            value={formatTopicsLabel(request.categories)}
          />
          <SummaryRow
            label="Custom query"
            value={displayOrDash(request.customQuery)}
          />
          <SummaryRow
            label="Sources filter"
            value={formatSourcesFilterLabel(request.sources)}
          />
        </dl>
      </CardContent>
    </Card>
  );
}
