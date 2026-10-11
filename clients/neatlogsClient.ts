/**
 * Neatlogs tracing client.
 * https://docs.neatlogs.com/sdk/typescript
 *
 * `init()` runs once per process. Export stays off when `NEATLOGS_API_KEY`
 * is unset. Long-running Next.js servers call `ready()` from `instrumentation.ts`.
 *
 * Spans are redacted / clipped by `createNeatlogsMask` at export. Tracing
 * helpers (workflows, agents, tools) live in `lib/observability/neatlogs.ts`.
 */

import * as ai from "ai";
import { flush, init, shutdown, type InitOptions } from "neatlogs";
import { wrapAISDK } from "neatlogs/ai";
import { wrapOpenAI } from "neatlogs/openai";
import { z } from "zod";
import { createNeatlogsMask } from "@/lib/observability/mask";

const DEFAULT_WORKFLOW_NAME = "dainik-samachar";

const neatlogsOptionsSchema = z.object({
  apiKey: z.string().min(1).optional(),
  workflowName: z.string().min(1).optional(),
  endpoint: z.url().optional(),
  debug: z.boolean().optional(),
  captureLogs: z.boolean().optional(),
});

export type NeatlogsClientOptions = z.input<typeof neatlogsOptionsSchema>;

function readOptional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function readBool(name: string): boolean | undefined {
  const raw = readOptional(name)?.toLowerCase();
  if (raw == null) {
    return undefined;
  }
  if (raw === "1" || raw === "true") {
    return true;
  }
  if (raw === "0" || raw === "false") {
    return false;
  }
  console.warn(
    `[neatlogs] ${name} has unexpected value "${raw}"; ignoring it`,
  );
  return undefined;
}

function resolveEndpoint(explicit?: string): string | undefined {
  const value = explicit ?? readOptional("NEATLOGS_ENDPOINT");
  if (!value) {
    return undefined;
  }
  const parsed = z.url().safeParse(value);
  if (!parsed.success) {
    console.warn(
      `[neatlogs] NEATLOGS_ENDPOINT is not a valid URL; using the SDK default`,
    );
    return undefined;
  }
  return parsed.data.replace(/\/$/, "");
}

export function createNeatlogsClient(options: NeatlogsClientOptions = {}) {
  const parsed = neatlogsOptionsSchema.parse(options);
  const apiKey = parsed.apiKey ?? readOptional("NEATLOGS_API_KEY");
  const workflowName =
    parsed.workflowName ??
    readOptional("NEATLOGS_WORKFLOW_NAME") ??
    DEFAULT_WORKFLOW_NAME;
  const endpoint = resolveEndpoint(parsed.endpoint);
  const debug = parsed.debug ?? readBool("NEATLOGS_DEBUG");
  const captureLogs =
    parsed.captureLogs ?? readBool("NEATLOGS_CAPTURE_LOGS");

  const initOptions: InitOptions = {
    apiKey,
    workflowName,
    ...(endpoint ? { endpoint } : {}),
    ...(debug != null ? { debug } : {}),
    ...(captureLogs != null ? { captureLogs } : {}),
    mask: createNeatlogsMask(readOptional("NEATLOGS_LOCAL_SPAN_LOG")),
  };

  let readyPromise: Promise<void> | undefined;
  let warnedMissingKey = false;

  function ready(): Promise<void> {
    readyPromise ??= init(initOptions)
      .then(() => {
        if (!apiKey && !warnedMissingKey) {
          warnedMissingKey = true;
          console.warn(
            "[neatlogs] NEATLOGS_API_KEY is not set; traces are not exported",
          );
        }
      })
      .catch((error: unknown) => {
        readyPromise = undefined;
        const message =
          error instanceof Error
            ? error.message
            : "Neatlogs init failed";
        console.warn(`[neatlogs] init failed: ${message}`);
      });
    return readyPromise;
  }

  const tracedAi = wrapAISDK(ai);

  return {
    workflowName,
    ready,
    flush,
    shutdown,
    wrapOpenAI,
    generateText: tracedAi.generateText,
    streamText: tracedAi.streamText,
  };
}

export const neatlogsClient = createNeatlogsClient();
