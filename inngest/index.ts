/**
 * Inngest function registry
 *
 * Registers all durable workflows served at /api/inngest:
 *
 * - newsPipelineFunction — Daily news request → stories in DB (news/pipeline.requested).
 * - chatPipelineFunction — First news-story deep-dive chat (chat/pipeline.requested).
 * - messageChatPipelineFunction — Normal / follow-up chat research (chat/message.research.requested).
 * - researchSourceDescriptionFunction — Async description + embedding for chat sources.
 */

export {
  NEWS_PIPELINE_EVENT,
  newsPipelineEventDataSchema,
  newsPipelineFunction,
  type NewsPipelineEventData,
} from "./newsPipeline";

export {
  CHAT_PIPELINE_EVENT,
  chatPipelineEventDataSchema,
  chatPipelineFunction,
  type ChatPipelineEventData,
} from "./newsNewchatPipeline";

export {
  RESEARCH_SOURCE_INDEX_EVENT,
  researchSourceIndexEventDataSchema,
  researchSourceDescriptionFunction,
  enqueueResearchSourceIndexing,
  type ResearchSourceIndexEventData,
} from "./researchSourceDescriptionPipeline";

export {
  MESSAGE_CHAT_PIPELINE_EVENT,
  messageChatPipelineEventDataSchema,
  messageChatPipelineFunction,
  type MessageChatPipelineEventData,
} from "./chatPipeline";

import { chatPipelineFunction } from "./newsNewchatPipeline";
import { messageChatPipelineFunction } from "./chatPipeline";
import { newsPipelineFunction } from "./newsPipeline";
import { researchSourceDescriptionFunction } from "./researchSourceDescriptionPipeline";

export const inngestFunctions = [
  newsPipelineFunction,
  chatPipelineFunction,
  messageChatPipelineFunction,
  researchSourceDescriptionFunction,
];
