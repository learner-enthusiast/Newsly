import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BookOpen, KeyRound, Sparkles } from "lucide-react";

/** Short orientation above the Scalar reference on `/docs/api`. */
export function ApiDocsIntro() {
  return (
    <section className="border-b border-border/60 bg-muted/20 px-4 py-6 md:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Developer documentation
          </p>
          <h1 className="font-display text-2xl tracking-tight md:text-3xl">
            Newsly REST API
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground md:text-base">
            Programmatic access to the same briefings, research reports, instrument
            search and newsletters as the web app. All endpoints live under{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">/api/v1</code>.
            Read the narrative sections in the sidebar first, then try operations
            with your API key.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/settings/developers"
            className={cn(buttonVariants({ variant: "default", size: "sm" }))}
          >
            <KeyRound data-icon="inline-start" />
            Create API key
          </Link>
          <Link
            href="/pricing"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <Sparkles data-icon="inline-start" />
            Pro plan
          </Link>
          <a
            href="/api/v1/openapi.json"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            target="_blank"
            rel="noopener noreferrer"
          >
            <BookOpen data-icon="inline-start" />
            OpenAPI JSON
          </a>
        </div>
        <ol className="grid gap-2 text-sm text-muted-foreground md:grid-cols-3">
          <li>
            <span className="font-medium text-foreground">1. Get a key</span> —
            Pro → Settings → Developers → copy{" "}
            <code className="text-xs">ds_live_…</code> once.
          </li>
          <li>
            <span className="font-medium text-foreground">2. Authorize here</span> —
            use Scalar&apos;s Bearer auth, then call{" "}
            <code className="text-xs">GET /me</code>.
          </li>
          <li>
            <span className="font-medium text-foreground">3. Async work</span> —
            briefings &amp; research return a job; poll{" "}
            <code className="text-xs">GET /jobs/&#123;id&#125;</code> or use
            webhooks.
          </li>
        </ol>
      </div>
    </section>
  );
}
