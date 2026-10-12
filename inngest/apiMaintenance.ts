import { inngest } from "@/clients/inngestClient";
import { deleteExpiredIdempotencyKeys } from "@/lib/api/v1/idempotency";
import { deleteOldRateLimitWindows } from "@/lib/api/v1/rateLimit";

export const API_MAINTENANCE_CRON = "15 3 * * *";

const RATE_LIMIT_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;

/** Daily: drop rate-limit windows older than 2 days and expired idempotency keys. */
export const apiMaintenanceFunction = inngest.createFunction(
  {
    id: "api-v1-maintenance",
    name: "Public API maintenance",
    triggers: [{ cron: API_MAINTENANCE_CRON }],
  },
  async ({ step }) => {
    const rateLimitWindows = await step.run("delete-old-rate-limit-windows", () =>
      deleteOldRateLimitWindows(new Date(Date.now() - RATE_LIMIT_RETENTION_MS)),
    );
    const idempotencyKeys = await step.run("delete-expired-idempotency-keys", () =>
      deleteExpiredIdempotencyKeys(),
    );
    return { rateLimitWindows, idempotencyKeys };
  },
);
