import { Button } from "@/components/ui/button";
import {
  StaticMarketingPage,
  StaticProseSection,
} from "@/components/marketing/StaticMarketingPage";
import {
  getGitHubFeatureRequestUrl,
  getGitHubIssuesUrl,
  getGitHubRepoUrl,
} from "@/lib/githubLinks";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

export function FeatureRequestPageContent() {
  const repoUrl = getGitHubRepoUrl();
  const newIssueUrl = getGitHubFeatureRequestUrl();
  const issuesUrl = getGitHubIssuesUrl();

  return (
    <StaticMarketingPage
      eyebrow="Product"
      title="Feature requests"
      lead="Newsly is built in the open. Tell us what would make research and briefings better for you."
      className="max-w-2xl"
    >
      <StaticProseSection title="Request on GitHub">
        <p>
          We track ideas, bugs, and improvements as GitHub issues so you can follow
          progress and discuss with the community.
        </p>
        <ul>
          <li>Describe the problem you&apos;re trying to solve</li>
          <li>Share how you&apos;d expect it to work in Newsly</li>
          <li>Note if it&apos;s about news briefings, chat research, or stories</li>
        </ul>
      </StaticProseSection>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button variant="brand-accent" nativeButton={false} render={<Link href={newIssueUrl} target="_blank" rel="noopener noreferrer" />}>
          <ExternalLink data-icon="inline-start" />
          Open a feature request
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link href={issuesUrl} target="_blank" rel="noopener noreferrer" />}>
          Browse existing issues
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Repository:{" "}
        <Link
          href={repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {repoUrl.replace("https://", "")}
        </Link>
      </p>
    </StaticMarketingPage>
  );
}
