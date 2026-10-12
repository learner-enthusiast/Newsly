import { fingerprint, normalizeParams } from "@/lib/newsletter/fingerprint";
import {
  countNewslettersForUser,
  createNewsletter,
  deleteNewsletter,
  getNewsletterForUser,
  listNewslettersForUser,
  MAX_NEWSLETTERS_PER_USER,
  patchNewsletter,
} from "@/repositories/newsletter";
import {
  computeNextRunFromSchedule,
  createNewsletterSchema,
  updateNewsletterSchema,
} from "@/services/newsletter/newsletterSchemas";
import { enqueueNewsletterTestRun } from "@/inngest/newsletterPipeline";

/** Over the per-user newsletter cap. */
export class NewsletterLimitError extends Error {}
/** Cross-field rule broken after merging a PATCH with the saved row. */
export class NewsletterInputError extends Error {}

export async function listNewsletters(userId: string) {
  const rows = await listNewslettersForUser(userId);
  return rows.map(serializeNewsletter);
}

function serializeNewsletter(
  row: Awaited<ReturnType<typeof listNewslettersForUser>>[number],
) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    isActive: row.isActive,
    location: row.location,
    latitude: row.latitude,
    longitude: row.longitude,
    scope: row.scope,
    storyCount: row.storyCount,
    categories: row.categories,
    customQuery: row.customQuery,
    language: row.language,
    sources: row.sources,
    frequency: row.frequency,
    sendTimeLocal: row.sendTimeLocal,
    timezone: row.timezone,
    dayOfWeek: row.dayOfWeek,
    dayOfMonth: row.dayOfMonth,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    deliveries: row.deliveries.map((delivery) => ({
      id: delivery.id,
      status: delivery.status,
      scheduledFor: delivery.scheduledFor.toISOString(),
      sentAt: delivery.sentAt?.toISOString() ?? null,
      storyCount: delivery.storyCount,
      error: delivery.error,
    })),
  };
}

export type SerializedNewsletter = ReturnType<typeof serializeNewsletter>;

export async function getNewsletterDetail(userId: string, id: string) {
  const row = await getNewsletterForUser(id, userId);
  return row ? serializeNewsletter(row) : null;
}

export async function createNewsletterForUser(
  userId: string,
  body: unknown,
) {
  const parsed = createNewsletterSchema.parse(body);
  const count = await countNewslettersForUser(userId);
  if (count >= MAX_NEWSLETTERS_PER_USER) {
    throw new NewsletterLimitError(`Maximum ${MAX_NEWSLETTERS_PER_USER} newsletters per user`);
  }

  const normalized = normalizeParams({
    location: parsed.scope === "world" ? null : (parsed.location?.trim() ?? null),
    latitude: parsed.latitude ?? null,
    longitude: parsed.longitude ?? null,
    scope: parsed.scope,
    categories: parsed.categories ?? [],
    customQuery: parsed.customQuery ?? null,
    language: parsed.language ?? null,
    sources: parsed.sources ?? [],
  });

  const nextRunAt = computeNextRunFromSchedule(parsed);

  const row = await createNewsletter({
    userId,
    name: parsed.name.trim(),
    email: parsed.email.trim(),
    location: parsed.scope === "world" ? null : (parsed.location?.trim() ?? null),
    latitude: parsed.scope === "world" ? null : (parsed.latitude ?? null),
    longitude: parsed.scope === "world" ? null : (parsed.longitude ?? null),
    scope: parsed.scope,
    storyCount: parsed.storyCount,
    categories: parsed.categories ?? [],
    customQuery: parsed.customQuery?.trim() ?? null,
    language: parsed.language?.trim() ?? null,
    sources: parsed.sources ?? [],
    frequency: parsed.frequency,
    sendTimeLocal: parsed.sendTimeLocal,
    timezone: parsed.timezone,
    dayOfWeek: parsed.dayOfWeek ?? null,
    dayOfMonth: parsed.dayOfMonth ?? null,
    paramsFingerprint: fingerprint(normalized),
    nextRunAt,
    isActive: true,
  });

  return serializeNewsletter({ ...row, deliveries: [] });
}

/** `undefined` keeps the saved value; anything else (including `null`) replaces it. */
function keep<T>(next: T | undefined, saved: T): T {
  return next === undefined ? saved : next;
}

export async function updateNewsletterForUser(
  userId: string,
  id: string,
  body: unknown,
) {
  const existing = await getNewsletterForUser(id, userId);
  if (!existing) {
    return null;
  }
  const parsed = updateNewsletterSchema.parse(body);

  const scope = keep(parsed.scope, existing.scope);
  const frequency = keep(parsed.frequency, existing.frequency);
  const needsLocation = scope === "local" || scope === "both";

  const location = needsLocation ? keep(parsed.location, existing.location) : null;
  const locationChanged = location !== existing.location;
  // Coordinates travel as a pair. A new location without new coordinates must
  // not keep the old city's coordinates.
  const coordsSent = parsed.latitude !== undefined || parsed.longitude !== undefined;
  const coords = !needsLocation
    ? { latitude: null, longitude: null }
    : coordsSent
      ? { latitude: parsed.latitude ?? null, longitude: parsed.longitude ?? null }
      : locationChanged
        ? { latitude: null, longitude: null }
        : { latitude: existing.latitude, longitude: existing.longitude };

  // Day fields only apply to their own frequency.
  const dayOfWeek = frequency === "WEEKLY" ? keep(parsed.dayOfWeek, existing.dayOfWeek) : null;
  const dayOfMonth = frequency === "MONTHLY" ? keep(parsed.dayOfMonth, existing.dayOfMonth) : null;

  if (needsLocation && !location) {
    throw new NewsletterInputError("location is required when scope is local or both");
  }
  if (frequency === "WEEKLY" && dayOfWeek == null) {
    throw new NewsletterInputError("dayOfWeek is required for WEEKLY");
  }
  if (frequency === "MONTHLY" && dayOfMonth == null) {
    throw new NewsletterInputError("dayOfMonth is required for MONTHLY");
  }

  const merged = {
    name: keep(parsed.name, existing.name),
    email: keep(parsed.email, existing.email),
    location,
    ...coords,
    scope,
    storyCount: keep(parsed.storyCount, existing.storyCount),
    categories: keep(parsed.categories, existing.categories),
    customQuery: keep(parsed.customQuery, existing.customQuery),
    language: keep(parsed.language, existing.language),
    sources: keep(parsed.sources, existing.sources),
    frequency,
    sendTimeLocal: keep(parsed.sendTimeLocal, existing.sendTimeLocal),
    timezone: keep(parsed.timezone, existing.timezone),
    dayOfWeek,
    dayOfMonth,
  };

  const normalized = normalizeParams({
    location: merged.location,
    latitude: merged.latitude,
    longitude: merged.longitude,
    scope: merged.scope,
    categories: merged.categories,
    customQuery: merged.customQuery,
    language: merged.language,
    sources: merged.sources,
  });

  const scheduleChanged =
    merged.frequency !== existing.frequency ||
    merged.sendTimeLocal !== existing.sendTimeLocal ||
    merged.timezone !== existing.timezone ||
    merged.dayOfWeek !== existing.dayOfWeek ||
    merged.dayOfMonth !== existing.dayOfMonth;

  // A paused newsletter has no next run; resuming recomputes it.
  const nextRunAt = !existing.isActive
    ? null
    : scheduleChanged || existing.nextRunAt == null
      ? computeNextRunFromSchedule(merged)
      : existing.nextRunAt;

  const updated = await patchNewsletter(id, userId, {
    ...merged,
    paramsFingerprint: fingerprint(normalized),
    nextRunAt,
  });

  if (!updated) {
    return null;
  }
  const full = await getNewsletterForUser(id, userId);
  return full ? serializeNewsletter(full) : null;
}

export async function setNewsletterActive(
  userId: string,
  id: string,
  isActive: boolean,
) {
  const existing = await getNewsletterForUser(id, userId);
  if (!existing) {
    return null;
  }
  const nextRunAt = isActive
    ? computeNextRunFromSchedule({
        frequency: existing.frequency,
        sendTimeLocal: existing.sendTimeLocal,
        timezone: existing.timezone,
        dayOfWeek: existing.dayOfWeek,
        dayOfMonth: existing.dayOfMonth,
      })
    : null;
  await patchNewsletter(id, userId, { isActive, nextRunAt });
  const full = await getNewsletterForUser(id, userId);
  return full ? serializeNewsletter(full) : null;
}

export async function removeNewsletter(userId: string, id: string) {
  return await deleteNewsletter(id, userId);
}

export async function sendNewsletterTest(
  userId: string,
  id: string,
  endUserId: string,
) {
  const existing = await getNewsletterForUser(id, userId);
  if (!existing) {
    return false;
  }
  await enqueueNewsletterTestRun(id, endUserId);
  return true;
}
