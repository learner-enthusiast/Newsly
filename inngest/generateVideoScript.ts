/**
 * Video script pipeline (Inngest)
 *
 * Event: `video/script.requested`
 * Trigger: `POST /api/news/stories/[storyId]/script` after creating a queued `VideoScript`.
 *
 * Stages (each sets `VideoScript.status`):
 * researching → scripting → fact_checking → directing → finding_images →
 * prompting → packaging → building → done
 *
 * researching   → researchBuilder (FactSheet)
 * scripting     → scriptWriter
 * fact_checking → factChecker (final script)
 * directing     → creativeDirector
 * finding_images → imageFinder (VisualAsset image/video rows)
 * prompting     → genPrompter (optional ai_*_prompt rows)
 * Later stages are placeholders that only advance the status.
 *
 * An agent returning `failed` stops the run (NonRetriableError → onFailure).
 *
 * onFailure marks the row `failed` with the error message.
 */

import { NonRetriableError } from "inngest";
import { createPipelineLogger } from "@/clients/pipelineLogger";
import { inngest } from "@/clients/inngestClient";
import {
  getVideoScriptById,
  markVideoScriptFailed,
  setVideoScriptStatus,
} from "@/repositories/videoScript";
import {
  runDirectionStage,
  runFactCheckStage,
  runImageStage,
  runPromptStage,
  runResearchStage,
  runScriptStage,
  type StageResult,
} from "@/services/videoScript/pipelineStages";
import type { VideoScriptStatus } from "@/services/videoScript/videoScriptTypes";
import { z } from "zod";

export const VIDEO_SCRIPT_REQUESTED_EVENT = "video/script.requested" as const;

export const videoScriptRequestedEventDataSchema = z.object({
  scriptId: z.string().min(1),
});

export type VideoScriptRequestedEventData = z.infer<
  typeof videoScriptRequestedEventDataSchema
>;

const pipelineLog = createPipelineLogger("[video-script-pipeline]");

/** Stages without an agent yet; they only advance the status. */
const PLACEHOLDER_STAGES: VideoScriptStatus[] = [
  "packaging",
  "building",
];

export function enqueueVideoScriptPipeline(data: VideoScriptRequestedEventData) {
  return inngest.send({
    name: VIDEO_SCRIPT_REQUESTED_EVENT,
    data: videoScriptRequestedEventDataSchema.parse(data),
  });
}

export const generateVideoScriptFunction = inngest.createFunction(
  {
    id: "generate-video-script",
    name: "Generate video script",
    triggers: [{ event: VIDEO_SCRIPT_REQUESTED_EVENT }],
    idempotency: "event.data.scriptId",
    timeouts: { finish: "30m" },
    onFailure: async ({ event, error, step }) => {
      const parsed = videoScriptRequestedEventDataSchema.safeParse(event.data);
      if (!parsed.success) {
        pipelineLog("onFailure", "invalid event data");
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      await step.run("mark-video-script-failed", async () => {
        await markVideoScriptFailed(parsed.data.scriptId, message);
      });
    },
  },
  async ({ event, step }) => {
    const { scriptId } = videoScriptRequestedEventDataSchema.parse(event.data);

    const loaded = await step.run("load-video-script", async () => {
      const row = await getVideoScriptById(scriptId);
      if (!row) {
        throw new Error("Video script not found");
      }
      return { status: row.status };
    });
    if (loaded.status === "done") {
      pipelineLog("load-video-script", "already done", { scriptId });
      return { scriptId, status: "done" };
    }

    const runStage = async <T extends Record<string, unknown>>(
      status: VideoScriptStatus,
      run: (id: string) => Promise<StageResult<T>>,
    ) =>
      step.run(`stage-${status}`, async () => {
        pipelineLog(`stage-${status}`, "start", { scriptId });
        await setVideoScriptStatus(scriptId, status);
        const result = await run(scriptId);
        if (!result.ok) {
          throw new NonRetriableError(result.reason);
        }
        pipelineLog(`stage-${status}`, "done", { scriptId, ...result });
        return result;
      });

    await runStage("researching", runResearchStage);
    await runStage("scripting", runScriptStage);
    await runStage("fact_checking", runFactCheckStage);
    await runStage("directing", runDirectionStage);
    await runStage("finding_images", runImageStage);
    await runStage("prompting", runPromptStage);

    for (const status of PLACEHOLDER_STAGES) {
      await step.run(`stage-${status}`, async () => {
        await setVideoScriptStatus(scriptId, status);
        return { status };
      });
    }

    await step.run("mark-video-script-done", async () => {
      await setVideoScriptStatus(scriptId, "done");
    });

    return { scriptId, status: "done" };
  },
);
