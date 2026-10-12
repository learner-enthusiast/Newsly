import { endpoints } from "@/lib/api/v1/contract";
import { ApiError, notFound } from "@/lib/api/v1/errors";
import { apiRoute } from "@/lib/api/v1/handler";
import { findApiJobForUser, jobDtoWithLiveStatus } from "@/lib/api/v1/jobs";
import type { ApiScope } from "@/lib/api/v1/scopes";

export const GET = apiRoute(endpoints.getJob, async ({ params, userId, apiKey }) => {
  const job = await findApiJobForUser(params.id, userId);
  if (!job) {
    throw notFound("Job");
  }
  const scope: ApiScope = job.type === "briefing" ? "news:read" : "research:read";
  if (!apiKey.scopes.includes(scope)) {
    throw new ApiError("forbidden", `This key is missing the "${scope}" scope.`, {
      details: { requiredScope: scope },
    });
  }
  return jobDtoWithLiveStatus(job);
});
