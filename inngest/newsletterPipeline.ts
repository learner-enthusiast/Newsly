import { NewsletterDigestEmail } from "@/emails/NewsletterDigestEmail";
import { inngest } from "@/clients/inngestClient";
import { sendEmail } from "@/lib/email/sendEmail";
import { getAppUrl } from "@/lib/email/resendClient";
import { computeNextRun } from "@/lib/newsletter/schedule";
import {
  isNewsletterEmailStopped,
  NEWSLETTER_STOPPED_RESULT,
} from "@/lib/newsletter/stopSwitch";
import { resolveSystemUserId } from "@/lib/newsletter/systemUser";
import { signNewsletterUnsubscribeToken } from "@/lib/newsletter/unsubscribeToken";
import { newsPipelineFunction } from "@/inngest/newsPipeline";
import { createNewsRequest } from "@/repositories/newsRequest";
import {
  advanceNewsletterNextRunIfMatches,
  listDueNewsletters,
} from "@/repositories/newsletter";
import {
  createNewsEdition,
  findEditionByFingerprintAndPeriod,
  getEditionById,
  patchNewsEdition,
} from "@/repositories/newsEdition";
import { patchNewsletterDeliveryIfExists } from "@/repositories/newsletterDelivery";
import {
  countStoriesByNewsRequestIds,
  listNewsStoriesByNewsRequestId,
} from "@/repositories/newsStory";
import { resolveSerpHl } from "@/services/news/newsGenerationRequest";
import { newsSearchQuerySchema } from "@/lib/newsSearchQuerySchema";
import { DEFAULT_SERP_LOCATION_RADIUS_METERS } from "@/lib/serpLocationGeo";
import { createPipelineLogger } from "@/clients/pipelineLogger";
import { cleanupOldEditions } from "@/services/newsletter/editionCleanup";
import {
  checkBeforeSend,
  claimDeliverySlot,
  editionKeyForRun,
  emailImageUrl,
  loadNewsletterForRun,
  newsletterStoryLinks,
  selectStoriesForSend,
  testRunScheduledFor,
} from "@/services/newsletter/newsletterRun";
import { NonRetriableError } from "inngest";
import { z } from "zod";
import {
  runWorkflow,
  startWorkflow,
  SYSTEM_END_USER_ID,
  traceField,
  WORKFLOWS,
} from "@/lib/observability";

export const NEWSLETTER_RUN_EVENT = "newsletter/run" as const;
export const NEWSLETTER_SCHEDULER_CRON = "*/5 * * * *";
/** Daily at 03:30 UTC. */
export const NEWSLETTER_EDITION_CLEANUP_CRON = "30 3 * * *";

const cleanupLog = createPipelineLogger("[newsletter-edition-cleanup]");

const runEventSchema = z.object({
  newsletterId: z.string().min(1),
  scheduledFor: z.string().datetime(),
  testRun: z.boolean().optional(),
});

const editionBuildEventSchema = z.object({
  fingerprint: z.string().min(1),
  periodKey: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  storyCount: z.number().int().min(1).max(20),
  scope: z.enum(["local", "world", "both"]),
  location: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  categories: z.array(z.string()),
  customQuery: z.string().nullable(),
  language: z.string().nullable(),
  sources: z.array(z.string()),
  serpHl: z.string(),
});

export const newsletterEditionBuildFunction = inngest.createFunction(
  {
    id: "newsletter-edition-build",
    name: "Newsletter edition build",
    triggers: [{ event: "newsletter/edition.build" }],
    concurrency: {
      limit: 1,
      key: "event.data.fingerprint + '-' + event.data.periodKey",
    },
  },
  async ({ event, step }) => {
    // Throws rather than returning so the invoking run gets no editionId to send.
    if (isNewsletterEmailStopped()) {
      throw new NonRetriableError("STOP_NEWSLETTER_EMAIL is set");
    }
    const input = editionBuildEventSchema.parse(event.data);
    const systemUserId = await step.run("resolve-system-user", () =>
      resolveSystemUserId(),
    );

    let editionId: string | null = null;
    let editionNewsRequestId: string | null = null;
    let editionTarget = input.storyCount;
    let editionStatus: string | null = null;

    const found = await step.run("find-edition", () =>
      findEditionByFingerprintAndPeriod(input.fingerprint, input.periodKey),
    );
    if (found) {
      editionId = found.id;
      editionNewsRequestId = found.newsRequestId;
      editionTarget = found.targetStoryCount;
      editionStatus = found.status;
    }

    if (!editionId) {
      const created = await step.run("create-edition-request", async () => {
        const request = await createNewsRequest({
          userId: systemUserId,
          date: new Date(`${input.date}T00:00:00.000Z`),
          location: input.location ?? undefined,
          latitude: input.latitude ?? undefined,
          longitude: input.longitude ?? undefined,
          scope: input.scope,
          storyCount: input.storyCount,
          categories: input.categories,
          customQuery: input.customQuery ?? undefined,
          language: input.language ?? undefined,
          sources: input.sources,
          status: "pending",
          isEdition: true,
          searchQuery: newsSearchQuerySchema.parse({ news: "pending", search: "pending" }),
          loadingLogs: ["Newsletter edition queued."],
        });
        const edition = await createNewsEdition({
          fingerprint: input.fingerprint,
          periodKey: input.periodKey,
          newsRequestId: request.id,
          targetStoryCount: input.storyCount,
        });
        return { editionId: edition.id, newsRequestId: request.id, target: input.storyCount };
      });
      editionId = created.editionId;
      editionNewsRequestId = created.newsRequestId;
      editionTarget = created.target;
      editionStatus = "BUILDING";
    } else if (input.storyCount > editionTarget) {
      editionTarget = input.storyCount;
      await step.run("bump-target", () =>
        patchNewsEdition(editionId!, {
          targetStoryCount: input.storyCount,
        }),
      );
    }

    if (!editionId || !editionNewsRequestId) {
      throw new Error("Edition missing after create");
    }

    const built = await step.run("count-stories", async () => {
      const counts = await countStoriesByNewsRequestIds([editionNewsRequestId!]);
      return counts.get(editionNewsRequestId!) ?? 0;
    });
    const target = Math.max(editionTarget, input.storyCount);

    if (built >= target && editionStatus === "READY") {
      return { editionId, built };
    }

    if (built >= target) {
      await step.run("mark-ready", () =>
        patchNewsEdition(editionId!, {
          status: "READY",
          builtStoryCount: built,
        }),
      );
      return { editionId, built };
    }

    const append = built > 0;

    await step.invoke("run-pipeline", {
      function: newsPipelineFunction,
      data: {
        // Provider spend for this build belongs to the shared edition.
        ...traceField(event, { editionId }),
        userId: systemUserId,
        newsRequestId: editionNewsRequestId,
        date: input.date,
        scope: input.scope,
        location: input.location,
        latitude: input.latitude,
        longitude: input.longitude,
        locationRadiusMeters:
          input.latitude != null && input.longitude != null
            ? DEFAULT_SERP_LOCATION_RADIUS_METERS
            : null,
        categories: input.categories,
        customQuery: input.customQuery,
        storyCount: target,
        language: input.language ?? "English",
        sources: input.sources,
        serpHl: input.serpHl,
        editionBuild: true,
        skipCompletionNotification: true,
        append,
        overrideStoryCount: target,
      },
    });

    const afterBuilt = await step.run("count-after", async () => {
      const counts = await countStoriesByNewsRequestIds([editionNewsRequestId!]);
      return counts.get(editionNewsRequestId!) ?? 0;
    });

    await step.run("finalize-edition", () =>
      patchNewsEdition(editionId!, {
        status: afterBuilt > 0 ? "READY" : "FAILED",
        builtStoryCount: afterBuilt,
        targetStoryCount: target,
      }),
    );

    return { editionId, built: afterBuilt };
  },
);

export const newsletterSchedulerFunction = inngest.createFunction(
  {
    id: "newsletter-scheduler",
    name: "Newsletter scheduler",
    triggers: [{ cron: NEWSLETTER_SCHEDULER_CRON }],
  },
  async ({ step }) => {
    if (isNewsletterEmailStopped()) {
      return NEWSLETTER_STOPPED_RESULT;
    }
    const due = await step.run("load-due", () => listDueNewsletters(new Date()));
    // One Neatlogs run per delivery, opened inside a step so replays reuse it.
    const traces = await step.run("open-run-traces", () =>
      Promise.all(
        due.map((row) =>
          startWorkflow(WORKFLOWS.newsletter, {
            endUserId: SYSTEM_END_USER_ID,
            source: "cron",
            input: { newsletterId: row.id, nextRunAt: row.nextRunAt },
          }),
        ),
      ),
    );
    for (const [index, row] of due.entries()) {
      if (!row.nextRunAt) {
        continue;
      }
      const scheduledIso = new Date(String(row.nextRunAt)).toISOString();
      await step.sendEvent(`enqueue-${row.id}`, {
        name: NEWSLETTER_RUN_EVENT,
        data: {
          newsletterId: row.id,
          scheduledFor: scheduledIso,
          trace: traces[index],
        },
        id: `newsletter-run-${row.id}-${scheduledIso}`,
      });
    }
    return { enqueued: due.length };
  },
);

export const newsletterRunFunction = inngest.createFunction(
  {
    id: "newsletter-run",
    name: "Newsletter run",
    triggers: [{ event: NEWSLETTER_RUN_EVENT }],
  },
  async ({ event, step }) => {
    if (isNewsletterEmailStopped()) {
      return NEWSLETTER_STOPPED_RESULT;
    }
    const input = runEventSchema.parse(event.data);
    const scheduledFor = new Date(input.scheduledFor);
    const testRun = input.testRun === true;

    // Fresh read before claiming a slot: a newsletter deleted or paused after
    // this run was queued sends nothing and leaves no delivery row.
    const loaded = await step.run("load-newsletter", () =>
      loadNewsletterForRun(input.newsletterId, testRun),
    );
    if (loaded.skip !== null) {
      return { skipped: true, reason: loaded.skip };
    }
    const newsletter = loaded.newsletter;

    const claim = await step.run("upsert-delivery", () =>
      claimDeliverySlot(newsletter.id, scheduledFor),
    );
    if (claim.skip) {
      return { skipped: true, reason: claim.skip };
    }
    const delivery = { id: claim.deliveryId };

    if (!testRun && newsletter.nextRunAt) {
      const expectedAt = new Date(String(newsletter.nextRunAt));
      const nextRunAt = computeNextRun({
        frequency: newsletter.frequency,
        sendTimeLocal: newsletter.sendTimeLocal,
        timezone: newsletter.timezone,
        dayOfWeek: newsletter.dayOfWeek,
        dayOfMonth: newsletter.dayOfMonth,
        from: scheduledFor,
      });
      await step.run("advance-next-run", () =>
        advanceNewsletterNextRunIfMatches(
          newsletter.id,
          expectedAt,
          nextRunAt,
        ),
      );
    }

    const window = editionKeyForRun(newsletter, scheduledFor);
    const fp = window.fingerprint;

    const edition = await step.invoke("ensure-edition", {
      function: newsletterEditionBuildFunction,
      data: {
        ...traceField(event),
        fingerprint: fp,
        periodKey: window.periodKey,
        date: window.date,
        storyCount: newsletter.storyCount,
        scope: newsletter.scope,
        location: newsletter.location,
        latitude: newsletter.latitude,
        longitude: newsletter.longitude,
        categories: newsletter.categories,
        customQuery: newsletter.customQuery,
        language: newsletter.language,
        sources: newsletter.sources,
        serpHl: resolveSerpHl(newsletter.language),
      },
    });

    const editionRow = await step.run("reload-edition", () =>
      getEditionById(edition.editionId),
    );
    if (!editionRow || editionRow.status !== "READY") {
      const recorded = await step.run("mark-delivery-failed", () =>
        patchNewsletterDeliveryIfExists(delivery.id, {
          status: "FAILED",
          error: "Edition not ready",
          editionId: edition.editionId,
        }),
      );
      if (!recorded) {
        return { skipped: true, reason: "deleted" as const };
      }
      throw new Error("Edition build failed");
    }

    const stories = await step.run("load-stories", async () => {
      const rows = await listNewsStoriesByNewsRequestId(
        editionRow.newsRequestId,
      );
      return selectStoriesForSend(rows, newsletter.storyCount);
    });

    if (stories.length === 0) {
      const recorded = await step.run("mark-skipped", () =>
        patchNewsletterDeliveryIfExists(delivery.id, {
          status: "SKIPPED",
          editionId: editionRow.id,
          storyCount: 0,
          error: "No stories available",
        }),
      );
      return { skipped: true, reason: recorded ? "empty" : "deleted" };
    }

    const appUrl = getAppUrl();
    const unsubscribeToken = signNewsletterUnsubscribeToken(newsletter.id);
    const unsubscribeUrl = `${appUrl}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}&id=${newsletter.id}`;

    const sent = await step.run("send-email", async () => {
      // The edition build can take minutes: re-check right before sending.
      const decision = await checkBeforeSend(newsletter.id, delivery.id, testRun);
      if (decision !== "send") {
        return { skipped: decision };
      }
      const claimed = await patchNewsletterDeliveryIfExists(delivery.id, {
        status: "SENDING",
        editionId: editionRow.id,
        storyCount: stories.length,
      });
      if (!claimed) {
        return { skipped: "deleted" as const };
      }
      const result = await sendEmail({
        to: newsletter.email,
        subject: `${newsletter.name} — ${window.date}`,
        idempotencyKey: `newsletter-${delivery.id}`,
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        react: NewsletterDigestEmail({
          newsletterName: newsletter.name,
          editionDateLabel: window.date,
          manageUrl: `${appUrl}/newsletters/${newsletter.id}`,
          unsubscribeUrl,
          stories: stories.map((story) => ({
            title: story.title,
            summary: story.summary,
            sourceLabel: story.sourceUrls[0]?.domain ?? "Source",
            ...newsletterStoryLinks(appUrl, story.id),
            imageUrl: emailImageUrl(story.imageUrl, appUrl),
          })),
        }),
      });
      // Deleted right after sending: nothing left to record.
      await patchNewsletterDeliveryIfExists(delivery.id, {
        status: "SENT",
        sentAt: new Date(),
        resendId: result.id,
        editionId: editionRow.id,
        storyCount: stories.length,
      });
      return { skipped: null };
    });

    if (sent.skipped) {
      return { skipped: true, reason: sent.skipped };
    }
    return { sent: true, storyCount: stories.length };
  },
);

/** `endUserId`: Clerk id of the user who asked for the test send. */
export async function enqueueNewsletterTestRun(
  newsletterId: string,
  endUserId: string,
) {
  const now = testRunScheduledFor();
  await runWorkflow(
    WORKFLOWS.newsletter,
    { endUserId, source: "newsletter", input: { newsletterId, testRun: true } },
    (trace) =>
      inngest.send({
        name: NEWSLETTER_RUN_EVENT,
        data: {
          newsletterId,
          scheduledFor: now.toISOString(),
          testRun: true,
          trace,
        },
        id: `newsletter-test-${newsletterId}-${now.toISOString()}`,
      }),
  );
}

export const newsletterEditionCleanupFunction = inngest.createFunction(
  {
    id: "newsletter-edition-cleanup",
    name: "Newsletter edition cleanup",
    triggers: [{ cron: NEWSLETTER_EDITION_CLEANUP_CRON }],
  },
  async ({ step }) => {
    if (isNewsletterEmailStopped()) {
      return NEWSLETTER_STOPPED_RESULT;
    }
    const result = await step.run("delete-old-editions", () =>
      cleanupOldEditions(),
    );
    cleanupLog("delete-old-editions", "done", result);
    return result;
  },
);
