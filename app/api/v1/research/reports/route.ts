import { endpoints } from "@/lib/api/v1/contract";
import { decodeCursor, pageFromRows } from "@/lib/api/v1/cursor";
import { researchStatusFilter, toResearchSummaryDto } from "@/lib/api/v1/dto";
import { apiRoute } from "@/lib/api/v1/handler";
import { listResearchPage } from "@/repositories/publicApi";

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
