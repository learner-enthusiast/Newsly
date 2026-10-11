/**
 * Retention cleanup for shared newsletter editions.
 *
 * Deletes editions older than `NEWSLETTER_EDITION_RETENTION_DAYS` (default 365)
 * together with their system-owned news request and stories — except editions
 * where any story has user activity (saved/bookmarked, voted, or linked to a
 * chat), which are kept. Never touches `Newsletter` rows; deliveries that
 * pointed at a deleted edition keep their row with `editionId` set to null.
 */

import {
  deleteEditionNewsRequests,
  findStoryIdsWithUserActivity,
  listEditionsCreatedBefore,
} from "@/repositories/newsEdition";
import { z } from "zod";

export const DEFAULT_EDITION_RETENTION_DAYS = 365;
const DAY_MS = 86_400_000;

export function editionRetentionDays(): number {
  const raw = process.env.NEWSLETTER_EDITION_RETENTION_DAYS?.trim();
  if (!raw) {
    return DEFAULT_EDITION_RETENTION_DAYS;
  }
  const parsed = z.coerce.number().int().min(1).safeParse(raw);
  if (!parsed.success) {
    console.warn(
      `[newsletter] NEWSLETTER_EDITION_RETENTION_DAYS="${raw}" is not a positive integer; using ${DEFAULT_EDITION_RETENTION_DAYS}`,
    );
    return DEFAULT_EDITION_RETENTION_DAYS;
  }
  return parsed.data;
}

export type EditionCleanupResult = {
  retentionDays: number;
  cutoff: string;
  candidates: number;
  deleted: number;
  keptForUserActivity: number;
};

export async function cleanupOldEditions(
  options: { now?: Date; retentionDays?: number } = {},
): Promise<EditionCleanupResult> {
  const retentionDays = options.retentionDays ?? editionRetentionDays();
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);

  const editions = await listEditionsCreatedBefore(cutoff);
  const storyIds = editions.flatMap((edition) =>
    edition.newsRequest.stories.map((story) => story.id),
  );
  const activeStoryIds = await findStoryIdsWithUserActivity(storyIds);

  const deletable: string[] = [];
  let keptForUserActivity = 0;
  for (const edition of editions) {
    const hasActivity = edition.newsRequest.stories.some((story) =>
      activeStoryIds.has(story.id),
    );
    if (hasActivity) {
      keptForUserActivity += 1;
    } else {
      deletable.push(edition.newsRequestId);
    }
  }

  const deleted = await deleteEditionNewsRequests(deletable);
  return {
    retentionDays,
    cutoff: cutoff.toISOString(),
    candidates: editions.length,
    deleted,
    keptForUserActivity,
  };
}
