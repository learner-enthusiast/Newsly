/**
 * Opaque keyset cursors. Clients pass `nextCursor` back verbatim; the content
 * (sort key + id of the last row) is an implementation detail and may change.
 */

import { z } from "zod";
import { ApiError } from "@/lib/api/v1/errors";

const cursorSchema = z.object({
  /** Sort timestamp of the last row (ISO), or null for rows without one. */
  t: z.iso.datetime().nullable(),
  /** Id of the last row (tie-breaker). */
  id: z.string().min(1).max(64),
});

export type Cursor = z.infer<typeof cursorSchema>;

export function encodeCursor(cursor: { t: Date | null; id: string }): string {
  const payload: Cursor = { t: cursor.t?.toISOString() ?? null, id: cursor.id };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCursor(raw: string | undefined): { t: Date | null; id: string } | null {
  if (raw === undefined) {
    return null;
  }
  try {
    const parsed = cursorSchema.parse(
      JSON.parse(Buffer.from(raw, "base64url").toString("utf8")),
    );
    return { t: parsed.t ? new Date(parsed.t) : null, id: parsed.id };
  } catch {
    throw new ApiError("invalid_request", "cursor is not valid. Pass nextCursor back unchanged.", {
      details: { fields: [{ in: "query", path: "cursor", message: "Invalid cursor" }] },
    });
  }
}

/**
 * Page from `limit + 1` rows ordered by (sortKey desc, id desc): the extra row
 * only tells whether another page exists.
 */
export function pageFromRows<T extends { id: string }>(
  rows: T[],
  limit: number,
  sortKey: (row: T) => Date | null,
): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  const nextCursor =
    rows.length > limit && last ? encodeCursor({ t: sortKey(last), id: last.id }) : null;
  return { items, nextCursor };
}

/**
 * Prisma `where` for "after this cursor" on (field desc nulls last, id desc).
 * Pass `nullable: true` only for nullable columns (Prisma rejects `null`
 * filters on required ones).
 */
export function afterCursorWhere(
  field: string,
  cursor: { t: Date | null; id: string } | null,
  { nullable = false }: { nullable?: boolean } = {},
) {
  if (!cursor) {
    return {};
  }
  if (cursor.t === null) {
    if (!nullable) {
      throw new ApiError("invalid_request", "cursor is not valid. Pass nextCursor back unchanged.");
    }
    return { [field]: null, id: { lt: cursor.id } };
  }
  return {
    OR: [
      { [field]: { lt: cursor.t } },
      { [field]: cursor.t, id: { lt: cursor.id } },
      ...(nullable ? [{ [field]: null }] : []),
    ],
  };
}
