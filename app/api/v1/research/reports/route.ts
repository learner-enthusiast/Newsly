import { endpoints } from "@/lib/api/v1/contract";
import { decodeCursor, pageFromRows } from "@/lib/api/v1/cursor";
import { researchStatusFilter, toResearchSummaryDto } from "@/lib/api/v1/dto";
import { ApiError } from "@/lib/api/v1/errors";
import { apiRoute } from "@/lib/api/v1/handler";
import { hashRequest } from "@/lib/api/v1/idempotency";
import {
  createApiJob,
  enqueueJobWebhook,
  jobApiUrl,
  jobDtoWithLiveStatus,
} from "@/lib/api/v1/jobs";
import { assertSafeWebhookUrl } from "@/lib/api/v1/webhooks";
import { listResearchPage } from "@/repositories/publicApi";
import {
  startStockResearch,
  StockResearchInputError,
} from "@/services/stockResearch/apiService";

export const GET = apiRoute(endpoints.listResearch, async ({ query, userId }) => {
  const rows = await listResearchPage({
    userId,
    assetType: query.assetType,
    statuses: researchStatusFilter(query.status),
    limit: query.limit,
    cursor: decodeCursor(query.cursor),
  });
  const { items, nextCursor } = pageFromRows(rows, query.limit, (row) => row.createdAt);
  return { data: items.map(toResearchSummaryDto), nextCursor };
});

export const POST = apiRoute(endpoints.createResearch, async (ctx) => {
  const { webhookUrl, ...params } = ctx.body;
  const webhook = webhookUrl ? (await assertSafeWebhookUrl(webhookUrl)).toString() : null;

  await ctx.consumePipelineQuota();
  const user = await ctx.getUser();
  let research;
  try {
    research = await startStockResearch(user, params, ctx.trace);
  } catch (error) {
    if (error instanceof StockResearchInputError) {
      throw new ApiError("invalid_request", error.message, {
        details: { fields: [{ in: "body", path: "instrumentKey", message: error.message }] },
      });
    }
    throw error;
  }

  const job = await createApiJob({
    userId: ctx.userId,
    apiKeyId: ctx.apiKey.id,
    type: "research",
    resourceId: research.id,
    requestHash: hashRequest("POST", "/api/v1/research/reports", params),
    deduplicated: false,
    webhookUrl: webhook,
  });
  if (webhook) {
    await enqueueJobWebhook(job.id);
  }
  return ctx.respond(202, await jobDtoWithLiveStatus(job), { Location: jobApiUrl(job.id) });
});
