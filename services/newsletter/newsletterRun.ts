/**
 * Decisions taken by the `newsletter-run` Inngest function, kept as plain
 * functions so they can be tested without Inngest.
 *
 * A run always works from the newsletter's current row: it is read fresh before
 * the delivery slot is claimed and again right before the email is sent, so
 * pauses, edits and deletes made after the run was queued are respected.
 */

import type { NewsletterFrequency, NewsScope } from "@/db/generated/client";
import { fingerprint, normalizeParams } from "@/lib/newsletter/fingerprint";
import { newsWindow } from "@/lib/newsletter/schedule";
import { getNewsletterById } from "@/repositories/newsletter";
import {
  patchNewsletterDeliveryIfExists,
  upsertNewsletterDelivery,
} from "@/repositories/newsletterDelivery";

export type RunSkipReason = "deleted" | "paused" | "already-sent";

/** Fresh read at the start of a run, before any delivery row is created. */
export async function loadNewsletterForRun(newsletterId: string, testRun: boolean) {
  const newsletter = await getNewsletterById(newsletterId);
  if (!newsletter) {
    return { skip: "deleted" as const, newsletter: null };
  }
  if (!newsletter.isActive && !testRun) {
    return { skip: "paused" as const, newsletter: null };
  }
  return { skip: null, newsletter };
}

type EditionParams = {
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  scope: NewsScope;
  categories: string[];
  customQuery: string | null;
  language: string | null;
  sources: string[];
  timezone: string;
  frequency: NewsletterFrequency;
};

/**
 * Shared-edition key for this send, from the newsletter's current content
 * settings. `storyCount` is deliberately not part of the fingerprint.
 */
export function editionKeyForRun(newsletter: EditionParams, scheduledFor: Date) {
  const normalized = normalizeParams({
    location: newsletter.location,
    latitude: newsletter.latitude,
    longitude: newsletter.longitude,
    scope: newsletter.scope,
    categories: newsletter.categories,
    customQuery: newsletter.customQuery,
    language: newsletter.language,
    sources: newsletter.sources,
  });
  const window = newsWindow(scheduledFor, newsletter.timezone, newsletter.frequency);
  return {
    fingerprint: fingerprint(normalized),
    periodKey: window.periodKey,
    date: window.date,
  };
}

/** Claims the (newsletter, scheduledFor) slot; a slot already sent is not sent again. */
export async function claimDeliverySlot(newsletterId: string, scheduledFor: Date) {
  const delivery = await upsertNewsletterDelivery({ newsletterId, scheduledFor });
  if (delivery.status === "SENT") {
    return { skip: "already-sent" as const, deliveryId: delivery.id };
  }
  return { skip: null, deliveryId: delivery.id };
}

/**
 * Last check right before sending. A newsletter paused since the run started
 * gets its delivery marked SKIPPED; a deleted one (delivery cascaded) is
 * reported so the run can exit cleanly.
 */
export async function checkBeforeSend(
  newsletterId: string,
  deliveryId: string,
  testRun: boolean,
): Promise<"send" | "deleted" | "paused"> {
  const current = await getNewsletterById(newsletterId);
  if (!current) {
    return "deleted";
  }
  if (!current.isActive && !testRun) {
    const recorded = await patchNewsletterDeliveryIfExists(deliveryId, {
      status: "SKIPPED",
      error: "Paused before send",
    });
    return recorded ? "paused" : "deleted";
  }
  return "send";
}

/** The edition may hold more stories than this newsletter wants. */
export function selectStoriesForSend<T>(stories: T[], storyCount: number): T[] {
  return stories.slice(0, storyCount);
}

/**
 * Image src for the digest email: mail clients need an absolute http(s) URL, so
 * app-relative paths (uploaded cover photos) are resolved against the app URL.
 */
export function emailImageUrl(
  imageUrl: string | null | undefined,
  appUrl: string,
): string | null {
  const raw = imageUrl?.trim();
  if (!raw) {
    return null;
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    return `${appUrl.replace(/\/+$/, "")}${raw}`;
  }
  return null;
}

/**
 * `scheduledFor` for a test send. Real slots always fall on a whole minute
 * (seconds and ms are 0), so a test time is nudged off the minute to never share
 * a real slot's delivery row.
 */
export function testRunScheduledFor(now: Date = new Date()): Date {
  const at = new Date(now);
  if (at.getUTCSeconds() === 0 && at.getUTCMilliseconds() === 0) {
    at.setUTCMilliseconds(1);
  }
  return at;
}
