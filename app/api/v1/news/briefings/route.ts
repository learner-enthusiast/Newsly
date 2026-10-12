import { prisma } from "@/db";
import { endpoints } from "@/lib/api/v1/contract";
import { decodeCursor, pageFromRows } from "@/lib/api/v1/cursor";
import { briefingStatusFilter, toBriefingSummaryDto } from "@/lib/api/v1/dto";
import { ApiError } from "@/lib/api/v1/errors";
import { apiRoute } from "@/lib/api/v1/handler";
import { hashRequest } from "@/lib/api/v1/idempotency";
import { sameBriefingParams } from "@/lib/api/v1/briefingDedupe";
import {
  createApiJob,
  enqueueJobWebhook,
  jobApiUrl,
  jobDtoWithLiveStatus,
} from "@/lib/api/v1/jobs";
import { assertSafeWebhookUrl } from "@/lib/api/v1/webhooks";
import { listBriefingsPage } from "@/repositories/publicApi";
import { findUserNewsRequest } from "@/repositories/user";
import { requestNews, type RequestNewsBody } from "@/services/news/apiService";
import {
  newsGenerationConfigFromNewsRequest,
  normalizeNewsGenerationRequest,
} from "@/services/news/newsGenerationRequest";

export const GET = apiRoute(endpoints.listBriefings, async ({ query, userId }) => {
  const rows = await listBriefingsPage({
    userId,
    status: briefingStatusFilter(query.status),
    limit: query.limit,
    cursor: decodeCursor(query.cursor),
  });
  const { items, nextCursor } = pageFromRows(rows, query.limit, (row) => row.createdAt);
  return { data: items.map(toBriefingSummaryDto), nextCursor };
});

export const POST = apiRoute(endpoints.createBriefing, async (ctx) => {
  const { webhookUrl, date, ...params } = ctx.body;
  const webhook = webhookUrl ? (await assertSafeWebhookUrl(webhookUrl)).toString() : null;

  const input: RequestNewsBody = {
    ...params,
    date: date ?? ctx.now.toISOString().slice(0, 10),
  };
  const config = normalizeNewsGenerationRequest(input);
  const requestHash = hashRequest("POST", "/api/v1/news/briefings", { ...input, webhookUrl: undefined });

  const existing = await findUserNewsRequest({
    userId: ctx.userId,
    date: new Date(`${config.date}T00:00:00.000Z`),
    scope: config.scope,
    location: config.location,
  });

  // A failed briefing is retried by requestNews: that's a new, quota-counted job.
  if (existing && existing.status !== "failed") {
    const stored = newsGenerationConfigFromNewsRequest(existing);
    const clientSentCoordinates = params.latitude !== undefined;
    if (!sameBriefingParams(config, stored, clientSentCoordinates)) {
      throw new ApiError(
        "conflict",
        "A briefing for this date, scope and location already exists with different parameters.",
        { details: { existingBriefingId: existing.id } },
      );
    }

    // Same request again: hand back the existing job (no pipeline, no quota).
    const previous = await prisma.apiJob.findFirst({
      where: { userId: ctx.userId, type: "briefing", resourceId: existing.id },
      orderBy: { createdAt: "desc" },
    });
    const reusable = previous && (webhook === null || previous.webhookUrl === webhook);
    const job = reusable
      ? previous
      : await createApiJob({
          userId: ctx.userId,
          apiKeyId: ctx.apiKey.id,
          type: "briefing",
          resourceId: existing.id,
          requestHash,
          deduplicated: true,
          webhookUrl: webhook,
        });
    if (!reusable && webhook) {
      await enqueueJobWebhook(job.id);
    }
    const dto = await jobDtoWithLiveStatus(job);
    return ctx.respond(200, { ...dto, deduplicated: true }, { Location: jobApiUrl(job.id) });
  }

  await ctx.consumePipelineQuota();
  const user = await ctx.getUser();
  const result = await requestNews(ctx.userId, input, user.clerkId, ctx.trace);

  const job = await createApiJob({
    userId: ctx.userId,
    apiKeyId: ctx.apiKey.id,
    type: "briefing",
    resourceId: result.newsRequest.id,
    requestHash,
    deduplicated: false,
    webhookUrl: webhook,
  });
  if (webhook) {
    await enqueueJobWebhook(job.id);
  }
  return ctx.respond(202, await jobDtoWithLiveStatus(job), { Location: jobApiUrl(job.id) });
});
