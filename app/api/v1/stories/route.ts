import { endpoints } from "@/lib/api/v1/contract";
import { decodeCursor, pageFromRows } from "@/lib/api/v1/cursor";
import { toStorySummaryDto } from "@/lib/api/v1/dto";
import { ApiError } from "@/lib/api/v1/errors";
import { apiRoute } from "@/lib/api/v1/handler";
import { listPublicStoriesPage } from "@/repositories/publicApi";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** `from`: start of the day for a date. `to`: inclusive, so a date means its last millisecond. */
function parseBound(value: string | undefined, bound: "from" | "to"): Date | undefined {
  if (value === undefined) return undefined;
  if (DATE_ONLY.test(value)) {
    const start = new Date(`${value}T00:00:00.000Z`);
    return bound === "from" ? start : new Date(start.getTime() + DAY_MS - 1);
  }
  return new Date(value);
}

export const GET = apiRoute(endpoints.listStories, async ({ query }) => {
  const publishedFrom = parseBound(query.from, "from");
  const publishedTo = parseBound(query.to, "to");
  if (publishedFrom && publishedTo && publishedFrom > publishedTo) {
    throw new ApiError("invalid_request", "`from` must not be after `to`.", {
      details: { fields: [{ in: "query", path: "from", message: "from is after to" }] },
    });
  }

  const rows = await listPublicStoriesPage({
    region: query.region,
    location: query.location,
    category: query.category,
    publishedFrom,
    publishedTo,
    q: query.q,
    limit: query.limit,
    cursor: decodeCursor(query.cursor),
  });
  const { items, nextCursor } = pageFromRows(rows, query.limit, (row) => row.publishedAt);
  return { data: items.map(toStorySummaryDto), nextCursor };
});
