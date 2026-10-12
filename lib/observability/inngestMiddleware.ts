/**
 * Inngest middleware: every `step.run` attempt of a function whose event carries
 * a `trace` ref (see `WorkflowRef`) runs inside that run's Neatlogs trace as a
 * CHAIN span named after the step, and flushes when the step ends.
 *
 * Covers `onFailure` handlers too (their event wraps the original in
 * `data.event`). Events without a `trace` ref run untraced at the step level;
 * their agent / tool spans then start their own traces.
 *
 * Every step (traced or not) also flushes buffered provider-usage rows.
 */

import { Middleware } from "inngest";
import {
  continueWorkflow,
  workflowRefFromEvent,
} from "@/lib/observability/neatlogs";
import { flushProviderUsage } from "@/lib/usage/recorder";

export class NeatlogsInngestMiddleware extends Middleware.BaseMiddleware {
  readonly id = "neatlogs";

  override async wrapStepHandler({
    ctx,
    next,
    stepInfo,
  }: Middleware.WrapStepHandlerArgs): Promise<unknown> {
    const ref = stepInfo.stepType === "run" ? workflowRefFromEvent(ctx.event) : null;
    try {
      if (!ref) {
        return await next();
      }
      return await continueWorkflow(ref, stepInfo.options.id, () => next());
    } finally {
      await flushProviderUsage();
    }
  }
}
