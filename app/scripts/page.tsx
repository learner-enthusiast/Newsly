import { VideoScriptCard } from "@/components/videoScript/VideoScriptCard";
import { buttonVariants } from "@/components/ui/button";
import { getAuthenticatedUser } from "@/lib/auth";
import { redirectToSignInModal } from "@/lib/redirectToSignInModal";
import { listVideoScriptsForUser } from "@/services/videoScript/videoScriptList";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "My video scripts — Newsly",
  description: "Video scripts you created from news stories.",
};

// Statuses change while the pipeline runs: never serve a cached list.
export const dynamic = "force-dynamic";

export default async function ScriptsPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return redirectToSignInModal();
  }

  const scripts = await listVideoScriptsForUser(user.id);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6 md:py-8">
        <header className="mb-6 space-y-2">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            My video scripts
          </h1>
          <p className="text-sm text-muted-foreground">
            Scripts you created from news stories, newest first. Open one to
            see the script, fact sheet, visuals and publishing kit.
          </p>
        </header>

        {scripts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-card/40 px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              No scripts yet. Open any story and choose{" "}
              <span className="font-medium text-foreground">
                Create video script
              </span>
              .
            </p>
            <Link
              href="/newsStory"
              className={buttonVariants({ variant: "outline", size: "sm", className: "mt-4" })}
            >
              Browse stories
            </Link>
          </div>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {scripts.map((script) => (
              <li key={script.id}>
                <VideoScriptCard script={script} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
