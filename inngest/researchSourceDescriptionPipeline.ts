import { runResearchSourceDescriptionAgent } from "@/Agents/chat/researchSourceDescriptionAgent";
import { inngest } from "@/clients/inngestClient";
import {
  getResearchSourceById,
  updateResearchSourceDescription,
} from "@/repositories/researchSource";
import { saveChatDescriptionEmbedding } from "@/repositories/pgVectorFunctions";
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

function indexLog(
  step: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  const suffix =
    extra && Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : "";
  console.log(`${PIPELINE_LOG_PREFIX} ${step}: ${message}${suffix}`);
}

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
      await saveChatDescriptionEmbedding({
        id: source.id,
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
