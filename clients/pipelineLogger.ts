import {
  logInfo,
  logPipeline,
  logPipelineError,
} from "@/clients/logger";

const PIPELINE_SUCCESS_PATTERN =
  /\b(finished|done|success|completed|succeeded|ready)\b/i;
const PIPELINE_ERROR_PATTERN =
  /\b(error|failed|failure|blocked|not found|mismatch)\b/i;

export type PipelineLogFn = (
  step: string,
  message: string,
  extra?: Record<string, unknown>,
) => void;

/** Colored Inngest / workflow logging (blue success path, magenta errors). */
export function createPipelineLogger(pipelineName: string): PipelineLogFn {
  return (step, message, extra) => {
    const context = {
      pipeline: pipelineName,
      step,
      ...extra,
    };
    const haystack = `${step} ${message}`;

    if (PIPELINE_ERROR_PATTERN.test(haystack)) {
      logPipelineError(message, context);
      return;
    }

    if (PIPELINE_SUCCESS_PATTERN.test(haystack)) {
      logPipeline(message, context);
      return;
    }

    logInfo(message, context);
  };
}
