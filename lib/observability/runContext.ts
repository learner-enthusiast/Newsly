import { execSync } from "node:child_process";
import { z } from "zod";

export const runSourceSchema = z.enum([
  "web",
  "chat",
  "newsletter",
  "eval",
  "batch",
  "cron",
]);
export type RunSource = z.infer<typeof runSourceSchema>;

/** `endUserId` for runs with no signed-in user (cron, newsletter editions). */
export const SYSTEM_END_USER_ID = "system";

/**
 * One user action = one run. Plain JSON so it can travel through Inngest event
 * data and step results; `traceparent` lets each step rejoin the run's trace.
 */
export const runContextSchema = z.object({
  runId: z.string().min(1),
  /** W3C traceparent of the run's root span; null when tracing is off. */
  traceparent: z.string().nullable(),
  source: runSourceSchema,
  agentGroup: z.string().min(1),
  /** Clerk user id (`user_…`) or {@link SYSTEM_END_USER_ID}. */
  endUserId: z.string().min(1),
  /** Internal `users.id`. */
  userId: z.string().nullable(),
  sessionId: z.string().nullable(),
  market: z.enum(["IN", "US"]).nullable(),
  assetType: z.string().nullable(),
  startedAt: z.string(),
});
export type RunContext = z.infer<typeof runContextSchema>;

let cachedGitSha: string | undefined;

export function gitSha(): string {
  if (cachedGitSha) {
    return cachedGitSha;
  }
  const fromEnv =
    process.env.GIT_SHA?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.SOURCE_COMMIT?.trim();
  if (fromEnv) {
    cachedGitSha = fromEnv.slice(0, 12);
    return cachedGitSha;
  }
  try {
    cachedGitSha = execSync("git rev-parse --short=12 HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    cachedGitSha = "unknown";
  }
  return cachedGitSha || "unknown";
}

/** Filter tags shared by every span of a run. */
export function runTags(ctx: RunContext): string[] {
  return [
    `source:${ctx.source}`,
    `group:${ctx.agentGroup}`,
    ...(ctx.market ? [`market:${ctx.market}`] : []),
    ...(ctx.assetType ? [`assetType:${ctx.assetType}`] : []),
  ];
}

/** Metadata shared by every span of a run. */
export function runMetadata(ctx: RunContext): Record<string, unknown> {
  return {
    runId: ctx.runId,
    userId: ctx.userId,
    endUserId: ctx.endUserId,
    sessionId: ctx.sessionId,
    source: ctx.source,
    agentGroup: ctx.agentGroup,
    market: ctx.market,
    assetType: ctx.assetType,
    gitSha: gitSha(),
  };
}
