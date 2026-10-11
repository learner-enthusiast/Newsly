/**
 * Newsletter edit / pause / delete lifecycle against the shared-edition design.
 * Runs against the database in DATABASE_URL (dev): every fixture belongs to
 * throwaway users that are deleted at the end (newsletters, requests, editions,
 * stories, votes and chats cascade). No email is sent and no LLM is called —
 * the run's decisions are exercised through `newsletterRun.ts`, the same
 * functions the Inngest run calls.
 *
 * Usage: pnpm test:newsletter
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";
import { prisma } from "@/db";
import { computeNextRun } from "@/lib/newsletter/schedule";
import {
  findEditionByFingerprintAndPeriod,
  getEditionById,
} from "@/repositories/newsEdition";
import { listDueNewsletters } from "@/repositories/newsletter";
import { patchNewsletterDeliveryIfExists } from "@/repositories/newsletterDelivery";
import { listNewsStoriesByNewsRequestId } from "@/repositories/newsStory";
import { cleanupOldEditions } from "@/services/newsletter/editionCleanup";
import {
  checkBeforeSend,
  claimDeliverySlot,
  editionKeyForRun,
  loadNewsletterForRun,
  selectStoriesForSend,
  testRunScheduledFor,
} from "@/services/newsletter/newsletterRun";
import {
  createNewsletterForUser,
  removeNewsletter,
  setNewsletterActive,
  updateNewsletterForUser,
} from "@/services/newsletter/newsletterService";

const createdUserIds: string[] = [];

after(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

async function makeUser() {
  const tag = randomUUID();
  const user = await prisma.user.create({
    data: { clerkId: `test-lifecycle-${tag}`, email: `lifecycle-${tag}@test.invalid` },
  });
  createdUserIds.push(user.id);
  return user;
}

const BASE_NEWSLETTER = {
  name: "Lifecycle test",
  email: "lifecycle@test.invalid",
  scope: "world",
  storyCount: 5,
  frequency: "DAILY",
  sendTimeLocal: "08:00",
  timezone: "Asia/Kolkata",
  categories: ["markets"],
};

/**
 * A unique focus query keeps each test's fingerprint (and so its editions)
 * separate from other tests and from real editions in the database.
 */
async function makeNewsletter(userId: string, overrides: Record<string, unknown> = {}) {
  return await createNewsletterForUser(userId, {
    ...BASE_NEWSLETTER,
    customQuery: `lifecycle test ${randomUUID()}`,
    ...overrides,
  });
}

/** A READY shared edition with `stories` ranked stories, like the edition build leaves it. */
async function makeEdition(
  ownerId: string,
  input: { fingerprint: string; periodKey: string; stories: number; createdAt?: Date },
) {
  const request = await prisma.newsRequest.create({
    data: {
      userId: ownerId,
      date: new Date("2026-01-01T00:00:00.000Z"),
      scope: "world",
      searchQuery: {},
      status: "success",
      isEdition: true,
      stories: {
        create: Array.from({ length: input.stories }, (_, i) => ({
          title: `Story ${i + 1}`,
          slug: `story-${i + 1}`,
          summary: "summary",
          content: "content",
          category: "markets",
          rank: i + 1,
        })),
      },
    },
    include: { stories: { orderBy: { rank: "asc" } } },
  });
  const edition = await prisma.newsEdition.create({
    data: {
      fingerprint: input.fingerprint,
      periodKey: input.periodKey,
      newsRequestId: request.id,
      targetStoryCount: input.stories,
      builtStoryCount: input.stories,
      status: "READY",
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    },
  });
  return { edition, requestId: request.id, storyIds: request.stories.map((s) => s.id) };
}

async function freshNewsletter(id: string) {
  const loaded = await loadNewsletterForRun(id, false);
  assert.equal(loaded.skip, null, "newsletter should be runnable");
  return loaded.newsletter!;
}

describe("newsletter lifecycle", () => {
  test("pause after queueing → no email, delivery skipped", async () => {
    const user = await makeUser();
    const newsletter = await makeNewsletter(user.id);
    const scheduledFor = new Date(newsletter.nextRunAt!);

    // Run claimed its slot, then the user paused while the edition was building.
    const claim = await claimDeliverySlot(newsletter.id, scheduledFor);
    await setNewsletterActive(user.id, newsletter.id, false);

    assert.equal(await checkBeforeSend(newsletter.id, claim.deliveryId, false), "paused");
    const delivery = await prisma.newsletterDelivery.findUnique({ where: { id: claim.deliveryId } });
    assert.equal(delivery?.status, "SKIPPED");

    // A run that starts after the pause stops before claiming anything.
    assert.equal((await loadNewsletterForRun(newsletter.id, false)).skip, "paused");
  });

  test("delete after queueing → no retry, no email, no orphan delivery", async () => {
    const user = await makeUser();
    const newsletter = await makeNewsletter(user.id);
    const claim = await claimDeliverySlot(newsletter.id, new Date(newsletter.nextRunAt!));

    assert.equal(await removeNewsletter(user.id, newsletter.id), true);

    assert.equal(await checkBeforeSend(newsletter.id, claim.deliveryId, false), "deleted");
    assert.equal(await prisma.newsletterDelivery.count({ where: { id: claim.deliveryId } }), 0);
    // Updating the cascaded delivery reports false instead of throwing (no step retry).
    assert.equal(await patchNewsletterDeliveryIfExists(claim.deliveryId, { status: "SENDING" }), false);
    assert.equal((await loadNewsletterForRun(newsletter.id, false)).skip, "deleted");
    // Deleting again is a clean "not found".
    assert.equal(await removeNewsletter(user.id, newsletter.id), false);
  });

  test("concurrent deletes → one succeeds, the other is not-found (no 500)", async () => {
    const user = await makeUser();
    const newsletter = await makeNewsletter(user.id);
    const results = await Promise.all([
      removeNewsletter(user.id, newsletter.id),
      removeNewsletter(user.id, newsletter.id),
    ]);
    assert.deepEqual([...results].sort(), [false, true]);
  });

  test("edit topics after queueing → new fingerprint / edition used", async () => {
    const user = await makeUser();
    const newsletter = await makeNewsletter(user.id);
    const scheduledFor = new Date(newsletter.nextRunAt!);
    const before = editionKeyForRun(await freshNewsletter(newsletter.id), scheduledFor);
    await makeEdition(user.id, { ...before, periodKey: before.periodKey, stories: 3 });

    await updateNewsletterForUser(user.id, newsletter.id, { categories: ["technology"] });
    const afterEdit = editionKeyForRun(await freshNewsletter(newsletter.id), scheduledFor);

    assert.notEqual(afterEdit.fingerprint, before.fingerprint);
    assert.equal(afterEdit.periodKey, before.periodKey);
    assert.equal(
      await findEditionByFingerprintAndPeriod(afterEdit.fingerprint, afterEdit.periodKey),
      null,
      "the edited newsletter must not reuse the old topics' edition",
    );
  });

  test("edit only storyCount → same edition, correct number of stories", async () => {
    const user = await makeUser();
    const newsletter = await makeNewsletter(user.id, { storyCount: 5 });
    const scheduledFor = new Date(newsletter.nextRunAt!);
    const before = editionKeyForRun(await freshNewsletter(newsletter.id), scheduledFor);
    const { requestId } = await makeEdition(user.id, { ...before, stories: 8 });

    await updateNewsletterForUser(user.id, newsletter.id, { storyCount: 3 });
    const edited = await freshNewsletter(newsletter.id);
    const afterEdit = editionKeyForRun(edited, scheduledFor);

    assert.equal(afterEdit.fingerprint, before.fingerprint);
    assert.ok(await findEditionByFingerprintAndPeriod(afterEdit.fingerprint, afterEdit.periodKey));
    const stories = selectStoriesForSend(
      await listNewsStoriesByNewsRequestId(requestId),
      edited.storyCount,
    );
    assert.equal(stories.length, 3);
    assert.deepEqual(stories.map((s) => s.title), ["Story 1", "Story 2", "Story 3"]);
  });

  test("resume after a week paused → next future slot, not a backlog", async () => {
    const user = await makeUser();
    const newsletter = await makeNewsletter(user.id);
    await setNewsletterActive(user.id, newsletter.id, false);
    // Simulate a week of missed slots: a stale nextRunAt from 7 days ago.
    await prisma.newsletter.update({
      where: { id: newsletter.id },
      data: { nextRunAt: new Date(Date.now() - 7 * 86_400_000) },
    });

    const before = new Date();
    const resumed = await setNewsletterActive(user.id, newsletter.id, true);
    const next = new Date(resumed!.nextRunAt!);

    assert.ok(next > before, "next send is in the future");
    assert.ok(next.getTime() <= before.getTime() + 86_400_000, "within one day for DAILY");
    const due = await listDueNewsletters(new Date());
    assert.ok(!due.some((row) => row.id === newsletter.id), "nothing is due right now");
  });

  test("edit schedule → nextRunAt updated correctly", async () => {
    const user = await makeUser();
    const newsletter = await makeNewsletter(user.id);
    const schedule = {
      frequency: "WEEKLY" as const,
      sendTimeLocal: "21:15",
      timezone: "Europe/London",
      dayOfWeek: 3,
      dayOfMonth: null,
    };
    const expectedBefore = computeNextRun(schedule).toISOString();
    const updated = await updateNewsletterForUser(user.id, newsletter.id, schedule);
    const expectedAfter = computeNextRun(schedule).toISOString();
    assert.ok([expectedBefore, expectedAfter].includes(updated!.nextRunAt!));
    assert.notEqual(updated!.nextRunAt, newsletter.nextRunAt);

    // A save that doesn't change the schedule keeps the next send.
    const renamed = await updateNewsletterForUser(user.id, newsletter.id, { name: "Renamed" });
    assert.equal(renamed!.nextRunAt, updated!.nextRunAt);
  });

  test("delete one user's newsletter → shared edition still served to others", async () => {
    const [userA, userB, system] = await Promise.all([makeUser(), makeUser(), makeUser()]);
    const focus = `lifecycle shared ${randomUUID()}`;
    const a = await makeNewsletter(userA.id, { customQuery: focus });
    const b = await makeNewsletter(userB.id, { customQuery: focus });
    const scheduledFor = new Date(a.nextRunAt!);
    const keyA = editionKeyForRun(await freshNewsletter(a.id), scheduledFor);
    const keyB = editionKeyForRun(await freshNewsletter(b.id), scheduledFor);
    assert.deepEqual(keyA, keyB, "same settings share one edition");
    const { edition } = await makeEdition(system.id, { ...keyA, stories: 5 });
    await claimDeliverySlot(a.id, scheduledFor);

    assert.equal(await removeNewsletter(userA.id, a.id), true);

    const shared = await findEditionByFingerprintAndPeriod(keyB.fingerprint, keyB.periodKey);
    assert.equal(shared?.id, edition.id);
    assert.equal(shared?.status, "READY");
    assert.equal((await listNewsStoriesByNewsRequestId(shared!.newsRequestId)).length, 5);
    assert.equal((await loadNewsletterForRun(b.id, false)).skip, null);
  });

  test("cleanup cron → old editions removed; recent, user-touched and newsletters kept", async () => {
    const [owner, reader] = await Promise.all([makeUser(), makeUser()]);
    const runId = randomUUID();
    const old = new Date("1999-06-01T00:00:00.000Z");
    const recent = new Date("2000-12-20T00:00:00.000Z");
    const now = new Date("2001-01-01T00:00:00.000Z"); // cutoff (365 d) = 2000-01-02

    const make = (name: string, createdAt: Date) =>
      makeEdition(owner.id, { fingerprint: `test-${runId}`, periodKey: name, stories: 2, createdAt });
    const unused = await make("old-unused", old);
    const voted = await make("old-voted", old);
    const saved = await make("old-saved", old);
    const chatted = await make("old-chat", old);
    const fresh = await make("recent", recent);

    await prisma.newsStoryVote.create({
      data: { newsStoryId: voted.storyIds[1]!, userId: reader.id, vote: "UP" },
    });
    await prisma.user.update({
      where: { id: reader.id },
      data: { savedStories: { push: saved.storyIds[0]! } },
    });
    await prisma.chatSession.create({
      data: { userId: reader.id, newsStoryId: chatted.storyIds[0]!, isBookmarked: true },
    });
    const newsletter = await makeNewsletter(owner.id);
    const delivery = await claimDeliverySlot(newsletter.id, new Date(newsletter.nextRunAt!));
    await patchNewsletterDeliveryIfExists(delivery.deliveryId, { editionId: unused.edition.id });

    const result = await cleanupOldEditions({ now, retentionDays: 365 });

    assert.equal(result.deleted, 1);
    assert.equal(result.keptForUserActivity, 3);
    assert.equal(await getEditionById(unused.edition.id), null);
    assert.equal(await prisma.newsRequest.count({ where: { id: unused.requestId } }), 0);
    assert.equal(await prisma.newsStory.count({ where: { id: { in: unused.storyIds } } }), 0);
    for (const kept of [voted, saved, chatted, fresh]) {
      assert.ok(await getEditionById(kept.edition.id), "kept edition still exists");
    }
    // Newsletters and their delivery history are untouched (edition link nulled).
    assert.equal(await prisma.newsletter.count({ where: { id: newsletter.id } }), 1);
    const deliveryRow = await prisma.newsletterDelivery.findUnique({
      where: { id: delivery.deliveryId },
    });
    assert.equal(deliveryRow?.editionId, null);
  });

  test("test send never shares a real slot's scheduledFor", () => {
    const onTheMinute = new Date("2026-01-01T08:00:00.000Z");
    assert.equal(testRunScheduledFor(onTheMinute).getUTCMilliseconds(), 1);
    const offMinute = new Date("2026-01-01T08:00:12.345Z");
    assert.equal(testRunScheduledFor(offMinute).toISOString(), offMinute.toISOString());
  });
});
