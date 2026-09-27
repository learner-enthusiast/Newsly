/**
 * Inngest function registry
 *
 * All durable workflows are served from `app/api/inngest` via `inngestFunctions`.
 *
 * ── Pipelines (user-facing research) ────────────────────────────────────────
 *
 * newsPipelineFunction
 *   Event: `news/pipeline.requested`
 *   Fulfills a `NewsRequest` → multiple `NewsStory` rows (briefing), `NewsSource`
 *   children, `status=READY`, `creator/provenance=SYSTEM`. Notifications on
 *   success/failure (`onFailure` → idempotent `Notification` rows).
 *
 * chatPipelineFunction (newsNewchatPipeline.ts)
 *   Event: `chat/pipeline.requested`
 *   First turn for a news-story deep dive (`isFromNewsStory=true`) or legacy
 *   story-anchored start: research prompt from story + sources, Serp, Firecrawl,
 *   assistant reply. No pgvector reuse on this path.
 *
 * messageChatPipelineFunction (chatPipeline.ts)
 *   Event: `chat/message.research.requested`
 *   General / follow-up chat: guardrails → query enhancer → determiner → optional
 *   vector + Serp + YouTube + Firecrawl → chat model reply. When determiner sets
 *   `shouldCreateStory` (original chat only), creates PENDING `NewsStory` and
 *   emits `chat/story.research.requested` instead of a long assistant answer.
 *
 * chatStoryPipelineFunction (chatstoryPipeline.ts)
 *   Event: `chat/story.research.requested`
 *   Completes one chat-origin `NewsStory` using prepared context from the message
 *   chat pipeline (no guardrails/query enhancer rerun). Gap agent → optional extra
 *   Serp/Firecrawl → synthesizer (`targetStoryCount=1`) → same row `READY`.
 *
 * ── Background indexers (fire-and-forget) ───────────────────────────────────
 *
 * researchSourceDescriptionFunction
 *   Event: `research/source.index.requested`
 *   After `ResearchSource` insert: LLM description + pgvector embedding for
 *   session similarity search in later chat turns.
 *
 * chatMessageEmbeddingFunction
 *   Event: `chat/message.index.requested`
 *   After `ChatMessage` insert: memory summary + `chat_message_embeddings` for
 *   conversational retrieval (not used as factual story evidence).
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

export {
  CHAT_MESSAGE_INDEX_EVENT,
  chatMessageIndexEventDataSchema,
  chatMessageEmbeddingFunction,
  enqueueChatMessageVectorIndexing,
  type ChatMessageIndexEventData,
} from "./chatMessageEmbeddingPipeline";

export {
  CHAT_STORY_PIPELINE_EVENT,
  chatStoryPipelineEventDataSchema,
  chatStoryPipelineFunction,
  type ChatStoryPipelineEventData,
} from "./chatstoryPipeline";

import { chatPipelineFunction } from "./newsNewchatPipeline";
import { chatMessageEmbeddingFunction } from "./chatMessageEmbeddingPipeline";
import { messageChatPipelineFunction } from "./chatPipeline";
import { newsPipelineFunction } from "./newsPipeline";
import { researchSourceDescriptionFunction } from "./researchSourceDescriptionPipeline";
import { chatStoryPipelineFunction } from "./chatstoryPipeline";

export const inngestFunctions = [
  newsPipelineFunction,
  chatPipelineFunction,
  messageChatPipelineFunction,
  chatStoryPipelineFunction,
  researchSourceDescriptionFunction,
  chatMessageEmbeddingFunction,
];
