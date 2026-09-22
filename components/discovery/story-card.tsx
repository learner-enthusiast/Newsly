import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DiscoveryStorySummary } from "@/services/news/discovery-results.service";

export function StoryCard({
  discoveryRunId,
  story,
}: {
  discoveryRunId: string;
  story: DiscoveryStorySummary;
}) {
  const eventDate = story.eventDate
    ? new Date(story.eventDate).toLocaleDateString(undefined, {
        dateStyle: "medium",
      })
    : "—";

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-semibold text-primary">
            {story.rank}
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="text-base leading-snug">
              <Link
                href={`/dashboard/discovery/${discoveryRunId}/story/${story.eventId}`}
                className="hover:underline"
              >
                {story.title}
              </Link>
            </CardTitle>
            <CardDescription className="text-xs">
              {eventDate} · {story.eventType.replaceAll("_", " ")}
              {story.narrativeTitle ? ` · ${story.narrativeTitle}` : ""}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {story.whatChanged ? (
          <div>
            <p className="font-medium text-foreground">What changed</p>
            <p className="text-muted-foreground line-clamp-3">
              {story.whatChanged}
            </p>
          </div>
        ) : null}
        {story.whyItMatters ? (
          <div>
            <p className="font-medium text-foreground">Why it matters</p>
            <p className="text-muted-foreground line-clamp-3">
              {story.whyItMatters}
            </p>
          </div>
        ) : null}
        <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Evidence</dt>
            <dd className="font-medium">
              {story.evidenceConfidence != null
                ? `${Math.round(story.evidenceConfidence * 100)}%`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Independent sources</dt>
            <dd className="font-medium">{story.independentSourceCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Primary source</dt>
            <dd className="font-medium">
              {story.primarySourceAvailable ? "Yes" : "No"}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
