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
import { prisma } from "@/db";
import {
  API_JOB_WEBHOOK_EVENT,
  isTerminalJobStatus,
  readLiveJobState,
  toJobDto,
} from "@/lib/api/v1/jobs";
import { getOrCreateWebhookSecret, postWebhook } from "@/lib/api/v1/webhooks";

const POLL_INTERVAL = "10s";
/** 30 min at one check per 10s. */
const MAX_CHECKS = 180;

const eventSchema = z.object({ jobId: z.uuid() });

export type ApiJobWebhookPayload = {
  id: string;
  type: "job.succeeded" | "job.failed";
  createdAt: string;
  data: { job: ReturnType<typeof toJobDto> };
};

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
        prisma.apiJob.updateMany({
          where: { id: parsed.data.jobId, webhookStatus: "pending" },
          data: { webhookStatus: "failed" },
        }),
      );
    },
  },
  async ({ event, step }) => {
    const { jobId } = eventSchema.parse(event.data);

    let finished = false;
    for (let check = 0; check < MAX_CHECKS; check += 1) {
      finished = await step.run(`check-${check}`, async () => {
        const job = await prisma.apiJob.findUnique({ where: { id: jobId } });
        if (!job || job.webhookStatus !== "pending") return true;
        const live = await readLiveJobState(job);
        return live === null || isTerminalJobStatus(live.status);
      });
      if (finished) break;
      await step.sleep(`wait-${check}`, POLL_INTERVAL);
    }

    if (!finished) {
      await step.run("mark-expired", () =>
        prisma.apiJob.updateMany({
          where: { id: jobId, webhookStatus: "pending" },
          data: { webhookStatus: "expired" },
        }),
      );
      return { delivered: false, reason: "expired" };
    }

    return step.run("deliver", async () => {
      const job = await prisma.apiJob.findUnique({ where: { id: jobId } });
      if (!job?.webhookUrl || job.webhookStatus !== "pending") {
        return { delivered: false, reason: "not-pending" };
      }
      const dto = toJobDto(job, await readLiveJobState(job));
      const type = dto.status === "succeeded" ? "job.succeeded" : "job.failed";
      const payload: ApiJobWebhookPayload = {
        id: job.id,
        type,
        createdAt: new Date().toISOString(),
        data: { job: dto },
      };
      await prisma.apiJob.update({
        where: { id: job.id },
        data: { webhookAttempts: { increment: 1 } },
      });
      const { secret } = await getOrCreateWebhookSecret(job.userId);
      const result = await postWebhook({
        url: job.webhookUrl,
        secret,
        deliveryId: job.id,
        event: type,
        payload,
      });
      await prisma.apiJob.update({
        where: { id: job.id },
        data: { webhookStatus: "delivered", webhookDeliveredAt: new Date() },
      });
      return { delivered: true, status: result.status };
    });
  },
);
