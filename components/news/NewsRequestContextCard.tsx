"use client";

import {
  formatDisplayDate,
  formatNewsRequestStatusLabel,
  formatNewsRequestSummaryLines,
  formatNewsScopeLabel,
  type NewsRequestSummaryFields,
} from "@/services/news/newsRequestProgress";

type NewsRequestContextCardProps = NewsRequestSummaryFields & {
  status?: "pending" | "failed" | "success";
  customQuery?: string | null;
  language?: string | null;
  sources?: string[];
};

export function NewsRequestContextCard({
  status,
  customQuery,
  language,
  sources,
  ...request
}: NewsRequestContextCardProps) {
  const summaryLines = formatNewsRequestSummaryLines(request);

  return (
    <div className="rounded-md border bg-muted/30 p-4 text-sm">
      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Date</dt>
          <dd>{formatDisplayDate(request.date)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Scope</dt>
          <dd>{formatNewsScopeLabel(request.scope)}</dd>
        </div>
        {request.location ? (
          <div>
            <dt className="text-xs text-muted-foreground">Location</dt>
            <dd>{request.location}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs text-muted-foreground">Stories requested</dt>
          <dd>{request.storyCount}</dd>
        </div>
        {request.categories.length > 0 ? (
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Categories</dt>
            <dd>{request.categories.join(", ")}</dd>
          </div>
        ) : null}
        {customQuery?.trim() ? (
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Custom query</dt>
            <dd>{customQuery.trim()}</dd>
          </div>
        ) : null}
        {language?.trim() ? (
          <div>
            <dt className="text-xs text-muted-foreground">Language</dt>
            <dd>{language.trim()}</dd>
          </div>
        ) : null}
        {sources && sources.length > 0 ? (
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Preferred sources</dt>
            <dd>{sources.join(", ")}</dd>
          </div>
        ) : null}
        {status ? (
          <div>
            <dt className="text-xs text-muted-foreground">Status</dt>
            <dd>{formatNewsRequestStatusLabel(status)}</dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        {summaryLines.join(" · ")}
      </p>
    </div>
  );
}
