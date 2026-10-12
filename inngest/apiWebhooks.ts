/**
 * Public API job webhooks.
 *
 * Event: `api/job.webhook.requested` `{ jobId }` (sent when a job with a
 * `webhookUrl` is created). The pipelines emit no completion event, so the
 * function polls the job's underlying record every 10s for at most 30 min,
 * then POSTs one signed `job.succeeded` / `job.failed` event. The delivery
 * step is retried 3 times by Inngest (with its backoff); after that the job's
 * `webhookStatus` is `failed`. A job still running after 30 min gets
 * `expired` and no call — clients poll `GET /api/v1/jobs/{id}` instead.
 */

import { z } from "zod";
import { inngest } from "@/clients/inngestClient";
import { API_JOB_WEBHOOK_EVENT } from "@/lib/api/v1/jobs";
import {
  deliverJobWebhook,
  isJobReadyForWebhook,
  setPendingJobWebhookStatus,
} from "@/lib/api/v1/jobWebhook";

const POLL_INTERVAL = "10s";
/** 30 min at one check per 10s. */
const MAX_CHECKS = 180;

const eventSchema = z.object({ jobId: z.uuid() });

export const apiJobWebhookFunction = inngest.createFunction(
  {
    id: "api-v1-job-webhook",
    name: "Public API job webhook",
    triggers: [{ event: API_JOB_WEBHOOK_EVENT }],
    idempotency: "event.data.jobId",
    retries: 3,
    onFailure: async ({ event, step }) => {
      const parsed = eventSchema.safeParse(
        (event.data as { event?: { data?: unknown } }).event?.data,
      );
      if (!parsed.success) return;
      await step.run("mark-webhook-failed", () =>
        setPendingJobWebhookStatus(parsed.data.jobId, "failed"),
      );
    },
  },
  async ({ event, step }) => {
    const { jobId } = eventSchema.parse(event.data);

    let ready = false;
    for (let check = 0; check < MAX_CHECKS; check += 1) {
      ready = await step.run(`check-${check}`, () => isJobReadyForWebhook(jobId));
      if (ready) break;
      await step.sleep(`wait-${check}`, POLL_INTERVAL);
    }

    if (!ready) {
      await step.run("mark-expired", () => setPendingJobWebhookStatus(jobId, "expired"));
      return { delivered: false, reason: "expired" };
    }

    return step.run("deliver", () => deliverJobWebhook(jobId));
  },
);
