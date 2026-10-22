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
 * Phase 1: stages are stubs that only advance the status (with a short pause so
 * the stepper is visible). Agents land in later phases.
 *
 * onFailure marks the row `failed` with the error message.
 */

import { createPipelineLogger } from "@/clients/pipelineLogger";
import { inngest } from "@/clients/inngestClient";
import {
  getVideoScriptById,
  markVideoScriptFailed,
  setVideoScriptStatus,
} from "@/repositories/videoScript";
import { VIDEO_SCRIPT_STAGES } from "@/services/videoScript/videoScriptTypes";
import { z } from "zod";

export const VIDEO_SCRIPT_REQUESTED_EVENT = "video/script.requested" as const;

export const videoScriptRequestedEventDataSchema = z.object({
  scriptId: z.string().min(1),
});

export type VideoScriptRequestedEventData = z.infer<
  typeof videoScriptRequestedEventDataSchema
>;

const pipelineLog = createPipelineLogger("[video-script-pipeline]");

/** Phase 1 only: lets the stepper show each stage before agents exist. */
const STUB_STAGE_PAUSE = "1.5s";

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

    for (const stage of VIDEO_SCRIPT_STAGES) {
      await step.run(`stage-${stage.status}`, async () => {
        pipelineLog(`stage-${stage.status}`, "start", { scriptId });
        await setVideoScriptStatus(scriptId, stage.status);
        return { status: stage.status };
      });
      await step.sleep(`stub-pause-${stage.status}`, STUB_STAGE_PAUSE);
    }

    await step.run("mark-video-script-done", async () => {
      await setVideoScriptStatus(scriptId, "done");
    });

    return { scriptId, status: "done" };
  },
);
