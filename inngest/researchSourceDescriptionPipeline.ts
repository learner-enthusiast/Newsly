/**
 * Research source description + vector index (background)
 *
 * Event: `research/source.index.requested`
 *
 * Event data (`researchSourceIndexEventDataSchema`):
 * - `researchSourceId` — `ResearchSource` UUID
 * - `chatSessionId` — must match the source’s session
 *
 * Trigger: `enqueueResearchSourceIndexing` from `createResearchSource` (and paths
 * that persist new session research) via `inngest.send` — fire-and-forget.
 *
 * Function id: `research-source-description-index`
 * Timeout: 15 minutes
 *
 * Purpose:
 * After chat research saves a `ResearchSource` (Firecrawl article, YouTube transcript
 * row, etc.), generate a compact plain-text description, persist it on the row, and
 * embed it in `chat_resource_embeddings` for pgvector recall in
 * `messageChatPipelineFunction` (`vector-research-branch` / determiner
 * `useExistingResearch`). Does not block the main chat or story pipelines.
 *
 * ── Steps ───────────────────────────────────────────────────────────────────
 *
 * 1. load-research-source
 *    `getResearchSourceById`; verify session id matches event.
 *
 * 2. summarize-source
 *    `runResearchSourceDescriptionAgent` on title, URL, domain, scraped `content`.
 *
 * 3. persist-description-and-embedding
 *    `updateResearchSourceDescription` + `saveChatResourceEmbedding` (resource id =
 *    research source id, scoped to `chatSessionId`).
 */

import { runResearchSourceDescriptionAgent } from "@/Agents/chat/researchSourceDescriptionAgent";
import { createPipelineLogger } from "@/clients/pipelineLogger";
import { inngest } from "@/clients/inngestClient";
import {
  getResearchSourceById,
  updateResearchSourceDescription,
} from "@/repositories/researchSource";
import { saveChatResourceEmbedding } from "@/repositories/pgVectorFunctions";
import { toJsonSafeStepOutput } from "@/services/news/normalizeArticles";
import { z } from "zod";

export const RESEARCH_SOURCE_INDEX_EVENT =
  "research/source.index.requested" as const;

export const researchSourceIndexEventDataSchema = z.object({
  researchSourceId: z.uuid(),
  chatSessionId: z.uuid(),
});

export type ResearchSourceIndexEventData = z.infer<
  typeof researchSourceIndexEventDataSchema
>;

const PIPELINE_LOG_PREFIX = "[research-source-index]";
const indexLog = createPipelineLogger(PIPELINE_LOG_PREFIX);

/** Fire-and-forget: enqueue description + vector indexing (does not block callers). */
export function enqueueResearchSourceIndexing(
  data: ResearchSourceIndexEventData,
): void {
  const parsed = researchSourceIndexEventDataSchema.parse(data);
  void inngest
    .send({
      name: RESEARCH_SOURCE_INDEX_EVENT,
      data: parsed,
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      indexLog("enqueue", "failed", {
        researchSourceId: parsed.researchSourceId,
        error: message,
      });
    });
}

export const researchSourceDescriptionFunction = inngest.createFunction(
  {
    id: "research-source-description-index",
    name: "Research source description and vector index",
    triggers: [{ event: RESEARCH_SOURCE_INDEX_EVENT }],
    timeouts: { finish: "15m" },
  },
  async ({ event, step }) => {
    const input = researchSourceIndexEventDataSchema.parse(event.data);

    indexLog("run", "started", {
      researchSourceId: input.researchSourceId,
      chatSessionId: input.chatSessionId,
    });

    const source = await step.run("load-research-source", async () => {
      const row = await getResearchSourceById(input.researchSourceId);
      if (!row) {
        throw new Error("Research source not found");
      }
      if (row.chatSessionId !== input.chatSessionId) {
        throw new Error("Research source chat session mismatch");
      }
      return toJsonSafeStepOutput(row);
    });

    const description = await step.run("summarize-source", async () => {
      indexLog("summarize-source", "start", { id: source.id });
      const text = await runResearchSourceDescriptionAgent({
        title: source.title,
        url: source.url,
        domain: source.domain,
        content: source.content,
        abortSignal: AbortSignal.timeout(120_000),
      });
      indexLog("summarize-source", "done", {
        id: source.id,
        length: text.length,
      });
      return text;
    });

    await step.run("persist-description-and-embedding", async () => {
      indexLog("persist-description-and-embedding", "start", { id: source.id });
      await updateResearchSourceDescription(source.id, description);
      await saveChatResourceEmbedding({
        chatResourceId: source.id,
        chatSessionId: input.chatSessionId,
        description,
      });
      indexLog("persist-description-and-embedding", "done", { id: source.id });
      return { id: source.id };
    });

    indexLog("run", "finished", { researchSourceId: source.id });
    return toJsonSafeStepOutput({ researchSourceId: source.id, description });
  },
);
