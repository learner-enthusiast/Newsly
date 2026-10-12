import { endpoints } from "@/lib/api/v1/contract";
import { decodeCursor, pageFromRows } from "@/lib/api/v1/cursor";
import { briefingStatusFilter, toBriefingSummaryDto } from "@/lib/api/v1/dto";
import { apiRoute } from "@/lib/api/v1/handler";
import { listBriefingsPage } from "@/repositories/publicApi";

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
