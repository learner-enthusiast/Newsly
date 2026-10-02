/**
 * Inngest function registry
 *
 * All durable workflows register in `inngestFunctions` and are served from
 * `app/api/inngest`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * User-facing research pipelines
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * newsPipelineFunction (`newsPipeline.ts`)
 *   Event: `news/pipeline.requested`
 *
 * newsRerunPipelineFunction (`reRunPipeline.ts`)
 *   Event: `news/pipeline.rerun.requested`
 *   Data: `{ newsId }` — `NewsRequest` UUID; runs only when `isRerunning` is true.
 *   Outcome: Incremental Serp/YouTube discovery since last completion; may update existing
 *   stories, add sources, or create net-new stories; clears `isRerunning`; rerun completion
 *   notification. Does not re-run the full initial briefing or flip request to `failed` on error.
 *   Agents: StoryMatcher, StoryUpdateDecision, NewsSynthesizer (+ shared news scrape agents).
 *   See file header for step-by-step rerun semantics and dedupe boundary.
 *
 * chatPipelineFunction (`newsNewchatPipeline.ts`)
 *   Event: `chat/pipeline.requested`
 *   Input: `userId`, `chatSessionId`, `userMessageId`
 *   Outcome: First turn on story-anchored / deep-dive session — research prompt from
 *   story + sources, Serp, scrape, ChatModel reply. No pgvector recall.
 *
 * messageChatPipelineFunction (`chatPipeline.ts`)
 *   Event: `chat/message.research.requested`
 *   Input: `chatSessionId`, `chatMessageId`, optional `shouldCreateStory`
 *   Outcome: General follow-up chat — determiner, vector/Serp/YouTube, Firecrawl,
 *   assistant Markdown OR handoff to chat story pipeline. Idempotent per message.
 *   Enqueues potential story topics after normal replies.
 *
 * chatStoryPipelineFunction (`chatstoryPipeline.ts`)
 *   Event: `chat/story.research.requested`
 *   Input: `ChatStoryPipelineEventData` (prepared research from message chat)
 *   Outcome: One PENDING → READY user `NewsStory` + sources; gap agent for extra work.
 *   Idempotent per `storyId`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Background workers (fire-and-forget enqueue)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * researchSourceDescriptionFunction (`researchSourceDescriptionPipeline.ts`)
 *   Event: `research/source.index.requested`
 *   Enqueue: `createResearchSource` → `enqueueResearchSourceIndexing`
 *   Outcome: Description on `ResearchSource` + pgvector row for session similarity.
 *
 * chatMessageEmbeddingFunction (`chatMessageEmbeddingPipeline.ts`)
 *   Event: `chat/message.index.requested`
 *   Enqueue: `createChatMessage` → `enqueueChatMessageVectorIndexing`
 *   Outcome: Memory summary + `chat_message_embeddings` for conversational recall.
 *
 * chatPotentialStoryTopicsFunction (`chatPotentialStoryTopicsPipeline.ts`)
 *   Event: `chat/potential-story-topics.requested`
 *   Enqueue: message chat pipeline `step.sendEvent` after assistant reply
 *   Outcome: Append deduped labels to `ChatSession.potentialStories` (0–5 new).
 *   Idempotent per `chatMessageId`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Typical chat flow (general session)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   POST /api/chat/[id] → chat/message.research.requested
 *        → ResearchSource inserts → research/source.index.requested (each)
 *        → agent message → chat/message.index.requested
 *        → chat/potential-story-topics.requested (optional)
 *
 *   User “Create story…” → shouldCreateStory → chat/story.research.requested
 */

export {
  NEWS_PIPELINE_EVENT,
  newsPipelineEventDataSchema,
  newsPipelineFunction,
  type NewsPipelineEventData,
} from "./newsPipeline";

export {
  NEWS_RERUN_PIPELINE_EVENT,
  newsRerunPipelineEventDataSchema,
  newsRerunPipelineFunction,
  enqueueNewsRerunPipeline,
  type NewsRerunPipelineEventData,
} from "./reRunPipeline";

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

export {
  CHAT_POTENTIAL_STORY_TOPICS_EVENT,
  chatPotentialStoryTopicsEventDataSchema,
  chatPotentialStoryTopicsFunction,
  type ChatPotentialStoryTopicsEventData,
} from "./chatPotentialStoryTopicsPipeline";

import { chatPipelineFunction } from "./newsNewchatPipeline";
import { chatMessageEmbeddingFunction } from "./chatMessageEmbeddingPipeline";
import { messageChatPipelineFunction } from "./chatPipeline";
import { newsPipelineFunction } from "./newsPipeline";
import { newsRerunPipelineFunction } from "./reRunPipeline";
import { researchSourceDescriptionFunction } from "./researchSourceDescriptionPipeline";
import { chatPotentialStoryTopicsFunction } from "./chatPotentialStoryTopicsPipeline";
import { chatStoryPipelineFunction } from "./chatstoryPipeline";

export const inngestFunctions = [
  newsPipelineFunction,
  newsRerunPipelineFunction,
  chatPipelineFunction,
  messageChatPipelineFunction,
  chatStoryPipelineFunction,
  researchSourceDescriptionFunction,
  chatMessageEmbeddingFunction,
  chatPotentialStoryTopicsFunction,
];
