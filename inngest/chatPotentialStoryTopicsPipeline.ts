/**
 * Potential story topic detection (background)
 *
 * Event: `chat/potential-story-topics.requested`
 *
 * Event data (`chatPotentialStoryTopicsEventDataSchema`):
 * - `chatSessionId` — session to update
 * - `chatMessageId` — user turn that completed (idempotency key)
 * - `messages` — up to 10 recent turns including the current user message (from
 *   message chat pipeline context; not re-fetched here)
 *
 * Trigger: `step.sendEvent("enqueue-potential-story-topics")` at the end of the
 * **normal** message chat pipeline path (after assistant reply saved). Not emitted
 * on guardrail block or chat→story handoff early return.
 *
 * Function id: `chat-potential-story-topics`
 * Idempotency: `event.data.chatMessageId`
 * Timeout: 10 minutes
 *
 * Purpose:
 * Run `runPotentialStoryTopicAgent` to surface 0–5 **new** story subject labels from
 * recent conversation vs `ChatSession.potentialStories`. Does not write stories,
 * search the web, or block the main chat reply (separate Inngest function).
 *
 * UI: `GET /api/chat/[chatSessionId]/potential-stories` reads the same array for
 * the right sidebar (single fetch ~5s after assistant reply is ready).
 *
 * ── Steps ───────────────────────────────────────────────────────────────────
 *
 * 1. load-chat-session — Verify session exists; skip run if missing.
 *
 * 2. load-existing-potential-stories — `getPotentialStoriesByChatSessionId`.
 *
 * 3. run-potential-story-topic-agent — LLM JSON `{ newStoryTopics }`; post-filter
 *    dedupes against existing labels (`dedupeNewStoryTopics`).
 *
 * 4. persist-potential-story-topics — `appendPotentialStoriesForChatSession`
 *    (merge + dedupe); no-op when agent returns empty array.
 *
 * Returns `{ chatSessionId, addedTopics, potentialStories }` for observability.
 *
 * Agent: `runPotentialStoryTopicAgent` in `chatStoryIdentifierAgent.ts` —
 * `POTENTIAL_STORY_TOPIC_MODEL` (fallback `CHAT_STORY_IDENTIFIER_MODEL`,
 * `CHAT_STORY_SIMILARITY_QUERY_MODEL`). UI helpers: `QuickActionAgent`, `TryTheseQuestionAgent`
 * are separate API routes, not this Inngest function.
 */

import { runPotentialStoryTopicAgent } from "@/Agents/chat/chatStoryIdentifierAgent";
import { createPipelineLogger } from "@/clients/pipelineLogger";
import { inngest } from "@/clients/inngestClient";
import {
  appendPotentialStoriesForChatSession,
  getChatSessionById,
  getPotentialStoriesByChatSessionId,
} from "@/repositories/chatSession";
import { toJsonSafeStepOutput } from "@/services/news/normalizeArticles";
import { z } from "zod";

export const CHAT_POTENTIAL_STORY_TOPICS_EVENT =
  "chat/potential-story-topics.requested" as const;

const pipelineMessageSchema = z.object({
  role: z.string().min(1),
  content: z.string().min(1),
});

export const chatPotentialStoryTopicsEventDataSchema = z.object({
  chatSessionId: z.uuid(),
  chatMessageId: z.uuid(),
  messages: z.array(pipelineMessageSchema).max(10),
});

export type ChatPotentialStoryTopicsEventData = z.infer<
  typeof chatPotentialStoryTopicsEventDataSchema
>;

const PIPELINE_LOG_PREFIX = "[chat-potential-story-topics]";
const topicsLog = createPipelineLogger(PIPELINE_LOG_PREFIX);

export const chatPotentialStoryTopicsFunction = inngest.createFunction(
  {
    id: "chat-potential-story-topics",
    name: "Chat potential story topic detection",
    triggers: [{ event: CHAT_POTENTIAL_STORY_TOPICS_EVENT }],
    idempotency: "event.data.chatMessageId",
    timeouts: { finish: "10m" },
  },
  async ({ event, step }) => {
    const input = chatPotentialStoryTopicsEventDataSchema.parse(event.data);

    topicsLog("run", "started", {
      chatSessionId: input.chatSessionId,
      chatMessageId: input.chatMessageId,
      messageCount: input.messages.length,
    });

    const session = await step.run("load-chat-session", async () => {
      const row = await getChatSessionById(input.chatSessionId);
      if (!row) {
        topicsLog("load-chat-session", "missing session");
        return null;
      }
      return toJsonSafeStepOutput({ id: row.id });
    });

    if (!session) {
      return toJsonSafeStepOutput({ skipped: true, reason: "session_not_found" });
    }

    const existingStoryTopics = await step.run(
      "load-existing-potential-stories",
      async () => {
        const topics = await getPotentialStoriesByChatSessionId(
          input.chatSessionId,
        );
        return toJsonSafeStepOutput(topics);
      },
    );

    const detected = await step.run("run-potential-story-topic-agent", async () => {
      const result = await runPotentialStoryTopicAgent({
        messages: input.messages,
        existingStoryTopics,
        abortSignal: AbortSignal.timeout(120_000),
      });
      topicsLog("run-potential-story-topic-agent", "done", {
        newCount: result.newStoryTopics.length,
      });
      return toJsonSafeStepOutput(result.newStoryTopics);
    });

    const potentialStories = await step.run(
      "persist-potential-story-topics",
      async () => {
        if (detected.length === 0) {
          return toJsonSafeStepOutput(existingStoryTopics);
        }
        const updated = await appendPotentialStoriesForChatSession(
          input.chatSessionId,
          detected,
        );
        topicsLog("persist-potential-story-topics", "done", {
          totalCount: updated.length,
        });
        return toJsonSafeStepOutput(updated);
      },
    );

    topicsLog("run", "finished", {
      chatSessionId: input.chatSessionId,
      added: detected.length,
    });

    return toJsonSafeStepOutput({
      chatSessionId: input.chatSessionId,
      addedTopics: detected,
      potentialStories,
    });
  },
);
