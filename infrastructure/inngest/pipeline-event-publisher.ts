import { inngestClient } from "@/clients/inngestClient";
import type { PipelineEventPublisher } from "@/domain/news/pipeline-event-publisher";
import type {
  NewsEventName,
  NewsEventPayloadMap,
} from "@/domain/news/events";
import { newsEventPayloadSchemas } from "@/domain/news/events";

export function createInngestPipelineEventPublisher(
  send: typeof inngestClient.send = inngestClient.send,
): PipelineEventPublisher {
  return {
    async send<N extends NewsEventName>(name: N, data: NewsEventPayloadMap[N]) {
      const payload = newsEventPayloadSchemas[name].parse(data);
      await send({ name, data: payload });
    },
  };
}

export const pipelineEventPublisher = createInngestPipelineEventPublisher();
