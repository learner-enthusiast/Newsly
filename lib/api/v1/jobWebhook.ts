/**
 * The steps of the job webhook function (`inngest/apiWebhooks.ts`), as plain
 * functions so they can be tested without Inngest.
 */

import { prisma } from "@/db";
import { isTerminalJobStatus, readLiveJobState, toJobDto } from "@/lib/api/v1/jobs";
import { getOrCreateWebhookSecret } from "@/lib/api/v1/webhookSecrets";
import { postWebhook } from "@/lib/api/v1/webhooks";

export type ApiJobWebhookPayload = {
  id: string;
  type: "job.succeeded" | "job.failed";
  createdAt: string;
  data: { job: ReturnType<typeof toJobDto> };
};

/** True when there is nothing left to wait for: finished, deleted, or no pending webhook. */
export async function isJobReadyForWebhook(jobId: string): Promise<boolean> {
  const job = await prisma.apiJob.findUnique({ where: { id: jobId } });
  if (!job || job.webhookStatus !== "pending") return true;
  const live = await readLiveJobState(job);
  return live === null || isTerminalJobStatus(live.status);
}

export async function setPendingJobWebhookStatus(jobId: string, status: "expired" | "failed") {
  await prisma.apiJob.updateMany({
    where: { id: jobId, webhookStatus: "pending" },
    data: { webhookStatus: status },
  });
}

/** One delivery attempt. Throws when the receiver doesn't answer 2xx (the caller retries). */
export async function deliverJobWebhook(
  jobId: string,
  post: typeof postWebhook = postWebhook,
): Promise<{ delivered: boolean; status?: number; reason?: string }> {
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
  await prisma.apiJob.update({ where: { id: job.id }, data: { webhookAttempts: { increment: 1 } } });
  const { secret } = await getOrCreateWebhookSecret(job.userId);
  const result = await post({ url: job.webhookUrl, secret, deliveryId: job.id, event: type, payload });
  await prisma.apiJob.update({
    where: { id: job.id },
    data: { webhookStatus: "delivered", webhookDeliveredAt: new Date() },
  });
  return { delivered: true, status: result.status };
}
