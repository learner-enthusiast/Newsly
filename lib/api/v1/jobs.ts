/**
 * Async API jobs. An `ApiJob` row only links a request to the record the
 * pipeline works on; its status is always read live from that record.
 */

import type { z } from "zod";
import type { ApiJob } from "@/db/generated/client";
import { prisma } from "@/db";
import { inngest } from "@/clients/inngestClient";
import { appBaseUrl, briefingStatus, researchStatus } from "@/lib/api/v1/dto";
import type { JOB_STATUSES, jobSchema } from "@/lib/api/v1/schemas";

export const API_JOB_WEBHOOK_EVENT = "api/job.webhook.requested";

export type ApiJobType = "briefing" | "research";
type JobStatus = (typeof JOB_STATUSES)[number];
type JobDto = z.input<typeof jobSchema>;

export type LiveJobState = { status: JobStatus; completedAt: Date | null } | null;

export function isTerminalJobStatus(status: JobStatus): boolean {
  return status === "succeeded" || status === "failed";
}

/** Status of the underlying record; null when it was deleted. */
export async function readLiveJobState(job: Pick<ApiJob, "type" | "resourceId">): Promise<LiveJobState> {
  if (job.type === "briefing") {
    const row = await prisma.newsRequest.findUnique({
      where: { id: job.resourceId },
      select: { status: true, completedAt: true },
    });
    return row ? { status: briefingStatus(row.status), completedAt: row.completedAt } : null;
  }
  const row = await prisma.stockResearch.findUnique({
    where: { id: job.resourceId },
    select: { status: true, completedAt: true },
  });
  return row ? { status: researchStatus(row.status), completedAt: row.completedAt } : null;
}

export function resourceApiUrl(job: Pick<ApiJob, "type" | "resourceId">): string {
  const path =
    job.type === "briefing" ? `/news/briefings/${job.resourceId}` : `/research/reports/${job.resourceId}`;
  return `${appBaseUrl()}/api/v1${path}`;
}

export function jobApiUrl(jobId: string): string {
  return `${appBaseUrl()}/api/v1/jobs/${jobId}`;
}

export function toJobDto(job: ApiJob, live: LiveJobState): JobDto {
  return {
    id: job.id,
    type: job.type === "briefing" ? "briefing" : "research",
    // A record deleted by its owner can't finish.
    status: live?.status ?? "failed",
    deduplicated: job.deduplicated,
    resource: {
      type: job.type === "briefing" ? "briefing" : "research_report",
      id: job.resourceId,
      url: resourceApiUrl(job),
    },
    webhook: job.webhookUrl
      ? {
          url: job.webhookUrl,
          status: (job.webhookStatus ?? "pending") as "pending" | "delivered" | "failed" | "expired",
        }
      : null,
    createdAt: job.createdAt.toISOString(),
    completedAt: live && isTerminalJobStatus(live.status) ? (live.completedAt?.toISOString() ?? null) : null,
  };
}

export async function jobDtoWithLiveStatus(job: ApiJob): Promise<JobDto> {
  return toJobDto(job, await readLiveJobState(job));
}

export function createApiJob(data: {
  userId: string;
  apiKeyId: string;
  type: ApiJobType;
  resourceId: string;
  requestHash: string;
  deduplicated: boolean;
  webhookUrl: string | null;
}): Promise<ApiJob> {
  return prisma.apiJob.create({
    data: { ...data, webhookStatus: data.webhookUrl ? "pending" : null },
  });
}

export function findApiJobForUser(id: string, userId: string): Promise<ApiJob | null> {
  return prisma.apiJob.findFirst({ where: { id, userId } });
}

/** Asks the webhook function to watch the job and call its URL once it finishes. */
export async function enqueueJobWebhook(jobId: string): Promise<void> {
  await inngest.send({ name: API_JOB_WEBHOOK_EVENT, data: { jobId }, id: `api-job-webhook-${jobId}` });
}
