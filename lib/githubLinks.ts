/** Public GitHub repo for issues and feature requests (override with env). */
const DEFAULT_GITHUB_REPO = "https://github.com/learner-enthusiast/puja-planner-";

export function getGitHubRepoUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_GITHUB_REPO_URL?.trim();
  const raw = fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_GITHUB_REPO;
  return raw.replace(/\.git\/?$/i, "").replace(/\/$/, "");
}

export function getGitHubFeatureRequestUrl(): string {
  return `${getGitHubRepoUrl()}/issues/new`;
}

export function getGitHubIssuesUrl(): string {
  return `${getGitHubRepoUrl()}/issues`;
}
