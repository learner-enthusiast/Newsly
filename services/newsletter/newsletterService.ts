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

export async function createNewsletterForUser(
  userId: string,
  body: unknown,
) {
  const parsed = createNewsletterSchema.parse(body);
  const count = await countNewslettersForUser(userId);
  if (count >= MAX_NEWSLETTERS_PER_USER) {
    throw new Error(`Maximum ${MAX_NEWSLETTERS_PER_USER} newsletters per user`);
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
  const merged = {
    name: parsed.name ?? existing.name,
    email: parsed.email ?? existing.email,
    location: parsed.location ?? existing.location,
    latitude: parsed.latitude ?? existing.latitude,
    longitude: parsed.longitude ?? existing.longitude,
    scope: parsed.scope ?? existing.scope,
    storyCount: parsed.storyCount ?? existing.storyCount,
    categories: parsed.categories ?? existing.categories,
    customQuery: parsed.customQuery ?? existing.customQuery,
    language: parsed.language ?? existing.language,
    sources: parsed.sources ?? existing.sources,
    frequency: parsed.frequency ?? existing.frequency,
    sendTimeLocal: parsed.sendTimeLocal ?? existing.sendTimeLocal,
    timezone: parsed.timezone ?? existing.timezone,
    dayOfWeek: parsed.dayOfWeek ?? existing.dayOfWeek,
    dayOfMonth: parsed.dayOfMonth ?? existing.dayOfMonth,
  };

  const normalized = normalizeParams({
    location: merged.scope === "world" ? null : merged.location,
    latitude: merged.latitude,
    longitude: merged.longitude,
    scope: merged.scope,
    categories: merged.categories,
    customQuery: merged.customQuery,
    language: merged.language,
    sources: merged.sources,
  });

  const scheduleChanged =
    parsed.frequency != null ||
    parsed.sendTimeLocal != null ||
    parsed.timezone != null ||
    parsed.dayOfWeek !== undefined ||
    parsed.dayOfMonth !== undefined;

  const nextRunAt = scheduleChanged
    ? computeNextRunFromSchedule({
        frequency: merged.frequency,
        sendTimeLocal: merged.sendTimeLocal,
        timezone: merged.timezone,
        dayOfWeek: merged.dayOfWeek,
        dayOfMonth: merged.dayOfMonth,
      })
    : existing.nextRunAt;

  const updated = await patchNewsletter(id, userId, {
    name: merged.name.trim(),
    email: merged.email.trim(),
    location: merged.scope === "world" ? null : merged.location,
    latitude: merged.scope === "world" ? null : merged.latitude,
    longitude: merged.scope === "world" ? null : merged.longitude,
    scope: merged.scope,
    storyCount: merged.storyCount,
    categories: merged.categories,
    customQuery: merged.customQuery,
    language: merged.language,
    sources: merged.sources,
    frequency: merged.frequency,
    sendTimeLocal: merged.sendTimeLocal,
    timezone: merged.timezone,
    dayOfWeek: merged.dayOfWeek,
    dayOfMonth: merged.dayOfMonth,
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
