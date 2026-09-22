import type { DiscoveryRun } from "@/db/generated/client";

export type DiscoveryRunResponse = {
  id: string;
  region: DiscoveryRun["region"];
  period: DiscoveryRun["period"];
  startDate: string;
  endDate: string;
  status: DiscoveryRun["status"];
  startedAt: string | null;
  completedAt: string | null;
  metadata: DiscoveryRun["metadata"];
};

export function serializeDiscoveryRun(
  run: DiscoveryRun,
): DiscoveryRunResponse {
  return {
    id: run.id,
    region: run.region,
    period: run.period,
    startDate: run.startDate.toISOString().slice(0, 10),
    endDate: run.endDate.toISOString().slice(0, 10),
    status: run.status,
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    metadata: run.metadata,
  };
}
