import { after } from "next/server";
import { withRunContext } from "@/lib/observability";
import { flushProviderUsage } from "@/lib/usage/recorder";

/**
 * Run provider calls made directly by an API route (not a workflow) on behalf
 * of a signed-in user, and write their usage rows after the response.
 */
export function withUserProviderUsage<T>(
  input: { userId: string; workflow: string },
  fn: () => Promise<T>,
): Promise<T> {
  after(() => flushProviderUsage());
  return withRunContext(
    {
      runId: null,
      workflow: input.workflow,
      userId: input.userId,
      source: "web",
      editionId: null,
      ipHash: null,
    },
    fn,
  );
}
