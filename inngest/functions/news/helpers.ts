import {
  discoveryRunIdPayloadSchema,
  rankingRunIdPayloadSchema,
  parseNewsEventPayload,
  NEWS_EVENTS,
} from "@/domain/news/events";
import { discoveryService } from "@/services/news/discovery.service";

export function parseDiscoveryRunEvent(data: unknown) {
  return discoveryRunIdPayloadSchema.parse(data);
}

export function parseRankingRunEvent(data: unknown) {
  return rankingRunIdPayloadSchema.parse(data);
}

export async function failDiscoveryFromStep(
  discoveryRunId: string,
  reason: string,
  stage: string,
) {
  parseNewsEventPayload(NEWS_EVENTS.DISCOVERY_FAILED, {
    discoveryRunId,
    reason,
    stage,
  });
  await discoveryService.markDiscoveryFailed(discoveryRunId, reason, stage);
}
