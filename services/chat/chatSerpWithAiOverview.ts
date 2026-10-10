import { runGaiOverviewSearchGeneratorAgent } from "@/Agents/news/GAIOverviewSearchGeneratorAgents";
import type { ValidatedSerpToolCall } from "@/Agents/chat/smallDeterminerAgent";
import { serpEngines } from "@/SERP/index";
import {
  extractAiOverviewTextFromSerpPayload,
  serpPayloadHasAiOverview,
  wrapAiOverviewFollowUpSerpPayload,
} from "@/services/news/normalizeArticles";
import {
  CHAT_SERP_NUM,
  normalizeSerpCallResults,
  type SerpCallResult,
} from "@/services/chat/chatSerpResearch";
import { sanitizeSerpToolInput } from "@/Agents/chat/smallDeterminerAgent";
import type { NormalizedSerpHit } from "@/services/chat/normalizeSerpResults";
import {
  mergeNormalizedSerpHits,
  normalizeSerpEnginePayload,
} from "@/services/chat/normalizeSerpResults";
import {
  normalizeSerpApiLocation,
  serpSearchWithLocationFallback,
} from "@/services/chat/serpApiLocation";

export const CHAT_AI_OVERVIEW_MAX_FOLLOW_UP = 3;
const AI_OVERVIEW_FOLLOW_UP_ENGINE = "google_search_ai_overview_follow_up";

async function runSerpCallWithAiOverviewFlag(
  call: ValidatedSerpToolCall,
  useAiOverviewFollowUp: boolean,
): Promise<unknown> {
  const engine = serpEngines[call.tool];
  const baseInput = sanitizeSerpToolInput(call.tool, {
    ...(call.input as Record<string, unknown>),
    num: CHAT_SERP_NUM,
  });
  const search = async (params: Record<string, unknown>) => {
    if (useAiOverviewFollowUp && call.tool === "searchGoogle") {
      return engine.fn({
        ...params,
        trigger_ai_overview: true,
      });
    }
    return engine.fn(params);
  };
  return serpSearchWithLocationFallback(search, baseInput);
}

async function fetchInitialSerpPayloads(
  calls: ValidatedSerpToolCall[],
  useAiOverviewFollowUp: boolean,
): Promise<SerpCallResult[]> {
  const payloads = await Promise.all(
    calls.map((call) => runSerpCallWithAiOverviewFlag(call, useAiOverviewFollowUp)),
  );
  return calls.map((call, index) => ({
    tool: call.tool,
    payload: payloads[index],
  }));
}

function firstSearchGooglePayload(results: SerpCallResult[]): unknown | null {
  for (const row of results) {
    if (row.tool === "searchGoogle") {
      return row.payload;
    }
  }
  return null;
}

function followUpHitsFromPayloads(payloads: unknown[]): NormalizedSerpHit[] {
  const batches: NormalizedSerpHit[] = [];
  for (const payload of payloads) {
    batches.push(
      ...normalizeSerpEnginePayload(
        payload,
        AI_OVERVIEW_FOLLOW_UP_ENGINE,
        CHAT_SERP_NUM,
      ),
    );
  }
  return batches;
}

/**
 * Run planned Serp calls; optionally fetch AI Overview on searchGoogle and
 * merge up to 3 parallel follow-up Google searches.
 */
export async function fetchAndNormalizeChatSerpResearch(input: {
  calls: ValidatedSerpToolCall[];
  researchPrompt: string;
  useAiOverviewFollowUp: boolean;
  abortSignal?: AbortSignal;
}): Promise<NormalizedSerpHit[]> {
  if (input.calls.length === 0) {
    return [];
  }

  const initialResults = await fetchInitialSerpPayloads(
    input.calls,
    input.useAiOverviewFollowUp,
  );

  let followUpResults: SerpCallResult[] = [];

  if (input.useAiOverviewFollowUp) {
    const googlePayload = firstSearchGooglePayload(initialResults);
    if (googlePayload && serpPayloadHasAiOverview(googlePayload)) {
      const aiOverviewText =
        extractAiOverviewTextFromSerpPayload(googlePayload);
      if (aiOverviewText?.trim()) {
        try {
          const generated = await runGaiOverviewSearchGeneratorAgent({
            aiOverviewText: [
              `User research question: ${input.researchPrompt.trim()}`,
              "",
              "Google AI Overview (discovery only — verify via scraped sources):",
              aiOverviewText.trim(),
            ].join("\n"),
            abortSignal: input.abortSignal,
          });

          const queries = generated.queries
            .slice(0, CHAT_AI_OVERVIEW_MAX_FOLLOW_UP)
            .map((row) => row.query.trim())
            .filter(Boolean);

          if (queries.length > 0) {
            const sharedFromCall = input.calls.find(
              (call) => call.tool === "searchGoogle",
            )?.input as Record<string, unknown> | undefined;

            const followUpPayloads = await Promise.all(
              queries.map((q) => {
                const followUpInput = sanitizeSerpToolInput("searchGoogle", {
                  q,
                  num: CHAT_SERP_NUM,
                  ...(sharedFromCall?.gl ? { gl: sharedFromCall.gl } : {}),
                  ...(sharedFromCall?.hl ? { hl: sharedFromCall.hl } : {}),
                  ...(sharedFromCall?.location
                    ? {
                        location: normalizeSerpApiLocation(
                          String(sharedFromCall.location),
                        ),
                      }
                    : {}),
                });
                return serpSearchWithLocationFallback(
                  (params) => serpEngines.searchGoogle.fn(params),
                  followUpInput,
                );
              }),
            );

            followUpResults = followUpPayloads.map((payload) => ({
              tool: "searchGoogle" as const,
              payload: wrapAiOverviewFollowUpSerpPayload(payload),
            }));
          }
        } catch {
          // Optional branch — continue with initial Serp hits only.
        }
      }
    }
  }

  const initialHits = normalizeSerpCallResults(initialResults);
  const followUpPayloads = followUpResults.map((row) => row.payload);
  const followUpHits =
    followUpPayloads.length > 0
      ? followUpHitsFromPayloads(followUpPayloads)
      : [];

  return mergeNormalizedSerpHits([...initialHits, ...followUpHits], 40);
}
