import { NewsletterDigestEmail } from "@/emails/NewsletterDigestEmail";
import { inngest } from "@/clients/inngestClient";
import { sendEmail } from "@/lib/email/sendEmail";
import { getAppUrl } from "@/lib/email/resendClient";
import { fingerprint, normalizeParams } from "@/lib/newsletter/fingerprint";
import { computeNextRun, newsWindow } from "@/lib/newsletter/schedule";
import { getSystemUserId } from "@/lib/newsletter/systemUser";
import { signNewsletterUnsubscribeToken } from "@/lib/newsletter/unsubscribeToken";
import { newsPipelineFunction } from "@/inngest/newsPipeline";
import { createNewsRequest } from "@/repositories/newsRequest";
import {
  advanceNewsletterNextRunIfMatches,
  getNewsletterById,
  listDueNewsletters,
} from "@/repositories/newsletter";
import {
  createNewsEdition,
  findEditionByFingerprintAndPeriod,
  getEditionById,
  patchNewsEdition,
} from "@/repositories/newsEdition";
import {
  patchNewsletterDelivery,
  upsertNewsletterDelivery,
} from "@/repositories/newsletterDelivery";
import {
  countStoriesByNewsRequestIds,
  listNewsStoriesByNewsRequestId,
} from "@/repositories/newsStory";
import { resolveSerpHl } from "@/services/news/newsGenerationRequest";
import { newsSearchQuerySchema } from "@/lib/newsSearchQuerySchema";
import { z } from "zod";

export const NEWSLETTER_RUN_EVENT = "newsletter/run" as const;
export const NEWSLETTER_SCHEDULER_CRON = "*/5 * * * *";

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
    const input = editionBuildEventSchema.parse(event.data);
    const systemUserId = getSystemUserId();

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
        userId: systemUserId,
        newsRequestId: editionNewsRequestId,
        date: input.date,
        scope: input.scope,
        location: input.location,
        latitude: input.latitude,
        longitude: input.longitude,
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
    const due = await step.run("load-due", () => listDueNewsletters(new Date()));
    for (const row of due) {
      if (!row.nextRunAt) {
        continue;
      }
      const scheduledIso = new Date(String(row.nextRunAt)).toISOString();
      await step.sendEvent(`enqueue-${row.id}`, {
        name: NEWSLETTER_RUN_EVENT,
        data: {
          newsletterId: row.id,
          scheduledFor: scheduledIso,
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
    const input = runEventSchema.parse(event.data);
    const scheduledFor = new Date(input.scheduledFor);

    const newsletter = await step.run("load-newsletter", () =>
      getNewsletterById(input.newsletterId),
    );
    if (!newsletter || (!newsletter.isActive && !input.testRun)) {
      return { skipped: true, reason: "inactive" };
    }

    const delivery = await step.run("upsert-delivery", () =>
      upsertNewsletterDelivery({
        newsletterId: newsletter.id,
        scheduledFor,
      }),
    );

    if (!input.testRun && newsletter.nextRunAt) {
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
    const fp = fingerprint(normalized);
    const window = newsWindow(
      scheduledFor,
      newsletter.timezone,
      newsletter.frequency,
    );

    const edition = await step.invoke("ensure-edition", {
      function: newsletterEditionBuildFunction,
      data: {
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
      await step.run("mark-delivery-failed", () =>
        patchNewsletterDelivery(delivery.id, {
          status: "FAILED",
          error: "Edition not ready",
          editionId: edition.editionId,
        }),
      );
      throw new Error("Edition build failed");
    }

    const stories = await step.run("load-stories", async () => {
      const rows = await listNewsStoriesByNewsRequestId(
        editionRow.newsRequestId,
      );
      return rows.slice(0, newsletter.storyCount);
    });

    if (stories.length === 0) {
      await step.run("mark-skipped", () =>
        patchNewsletterDelivery(delivery.id, {
          status: "SKIPPED",
          editionId: editionRow.id,
          storyCount: 0,
          error: "No stories available",
        }),
      );
      return { skipped: true, reason: "empty" };
    }

    const appUrl = getAppUrl();
    const unsubscribeToken = signNewsletterUnsubscribeToken(newsletter.id);
    const unsubscribeUrl = `${appUrl}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}&id=${newsletter.id}`;

    await step.run("send-email", async () => {
      await patchNewsletterDelivery(delivery.id, {
        status: "SENDING",
        editionId: editionRow.id,
        storyCount: stories.length,
      });
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
            storyUrl: `${appUrl}/newsStory/${story.id}`,
          })),
        }),
      });
      await patchNewsletterDelivery(delivery.id, {
        status: "SENT",
        sentAt: new Date(),
        resendId: result.id,
        editionId: editionRow.id,
        storyCount: stories.length,
      });
    });

    return { sent: true, storyCount: stories.length };
  },
);

export async function enqueueNewsletterTestRun(newsletterId: string) {
  const now = new Date();
  await inngest.send({
    name: NEWSLETTER_RUN_EVENT,
    data: {
      newsletterId,
      scheduledFor: now.toISOString(),
      testRun: true,
    },
    id: `newsletter-test-${newsletterId}-${now.toISOString()}`,
  });
}
