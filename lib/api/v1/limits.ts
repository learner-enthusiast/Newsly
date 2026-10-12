/**
 * Public API limits per plan. `null` means the plan has no API access.
 * Add future tiers (e.g. `business`) here and to `PlanTier`.
 *
 * Every Pro number can be overridden by env (see `.env.example`).
 */

import type { PlanTier } from "@/lib/billing/plan";

export type ApiPlanLimits = {
  /** Requests per key per rolling minute. */
  requestsPerMinute: number;
  /** Accepted pipeline jobs (briefings, research) per user per UTC day. */
  pipelineJobsPerDay: number;
  /** Keys that are neither revoked nor expired. */
  maxActiveKeys: number;
};

function envInt(name: string, fallback: number): number {
  const raw = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

export function getApiPlanLimits(plan: PlanTier): ApiPlanLimits | null {
  switch (plan) {
    case "pro":
      return {
        requestsPerMinute: envInt("API_PRO_REQUESTS_PER_MINUTE", 60),
        pipelineJobsPerDay: envInt("API_PRO_PIPELINE_JOBS_PER_DAY", 50),
        maxActiveKeys: envInt("API_PRO_MAX_ACTIVE_KEYS", 10),
      };
    case "free":
      return null;
  }
}

/** Limits shown to free users on the upgrade card. */
export function getProApiLimits(): ApiPlanLimits {
  return getApiPlanLimits("pro") as ApiPlanLimits;
}
