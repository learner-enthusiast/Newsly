import { endpoints } from "@/lib/api/v1/contract";
import { apiRoute } from "@/lib/api/v1/handler";
import { countAcceptedPipelineJobsSince } from "@/lib/api/v1/quota";
import { API_SCOPES, type ApiScope } from "@/lib/api/v1/scopes";

const DAY_MS = 24 * 60 * 60 * 1000;

export const GET = apiRoute(endpoints.me, async (ctx) => {
  const dayStart = new Date(
    Date.UTC(ctx.now.getUTCFullYear(), ctx.now.getUTCMonth(), ctx.now.getUTCDate()),
  );
  const [user, used] = await Promise.all([
    ctx.getUser(),
    countAcceptedPipelineJobsSince(ctx.userId, dayStart),
  ]);
  return {
    user: { id: user.id, email: user.email },
    plan: "pro" as const,
    apiKey: {
      id: ctx.apiKey.id,
      name: ctx.apiKey.name,
      prefix: ctx.apiKey.prefix,
      scopes: ctx.apiKey.scopes.filter((s): s is ApiScope =>
        (API_SCOPES as readonly string[]).includes(s),
      ),
      createdAt: ctx.apiKey.createdAt.toISOString(),
      expiresAt: ctx.apiKey.expiresAt?.toISOString() ?? null,
    },
    limits: {
      requestsPerMinute: ctx.limits.requestsPerMinute,
      pipelineJobsPerDay: ctx.limits.pipelineJobsPerDay,
    },
    usage: {
      pipelineJobsToday: used,
      pipelineJobsRemaining: Math.max(0, ctx.limits.pipelineJobsPerDay - used),
      quotaResetsAt: new Date(dayStart.getTime() + DAY_MS).toISOString(),
    },
  };
});
