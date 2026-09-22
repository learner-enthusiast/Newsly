import type {
  NewsEventName,
  NewsEventPayloadMap,
} from "@/domain/news/events";

/** Sends ID-only pipeline events (Inngest in production). */
export interface PipelineEventPublisher {
  send<N extends NewsEventName>(
    name: N,
    data: NewsEventPayloadMap[N],
  ): Promise<void>;
}
