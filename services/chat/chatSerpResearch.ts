import {
  sanitizeSerpToolInput,
  type ValidatedSerpToolCall,
} from "@/Agents/chat/smallDeterminerAgent";
import { serpEngines } from "@/SERP/index";
import {
  mergeNormalizedSerpHits,
  normalizeSerpEnginePayload,
  type NormalizedSerpHit,
} from "@/services/chat/normalizeSerpResults";
import {
  normalizeSerpApiLocation,
  serpSearchWithLocationFallback,
} from "@/services/chat/serpApiLocation";

export const CHAT_SERP_NUM = 20;

export async function runSerpToolCall(
  call: ValidatedSerpToolCall,
): Promise<unknown> {
  const engine = serpEngines[call.tool];
  const input = sanitizeSerpToolInput(call.tool, {
    ...(call.input as Record<string, unknown>),
    num: CHAT_SERP_NUM,
  });
  return serpSearchWithLocationFallback(
    (params) => engine.fn(params),
    input,
  );
}

export type SerpCallResult = {
  tool: ValidatedSerpToolCall["tool"];
  payload: unknown;
};

export async function fetchSerpPayloadsForCalls(
  calls: ValidatedSerpToolCall[],
): Promise<SerpCallResult[]> {
  const payloads = await Promise.all(calls.map((call) => runSerpToolCall(call)));
  return calls.map((call, index) => ({
    tool: call.tool,
    payload: payloads[index],
  }));
}

/** Same merge/dedupe behavior as the news-story chat pipeline Serp step. */
export function normalizeSerpCallResults(
  results: SerpCallResult[],
  maxTotal = 40,
): NormalizedSerpHit[] {
  const batches: NormalizedSerpHit[] = [];
  for (const result of results) {
    batches.push(
      ...normalizeSerpEnginePayload(
        result.payload,
        result.tool,
        CHAT_SERP_NUM,
      ),
    );
  }
  return mergeNormalizedSerpHits(batches, maxTotal);
}

export async function fetchAndNormalizeSerp(
  calls: ValidatedSerpToolCall[],
): Promise<NormalizedSerpHit[]> {
  if (calls.length === 0) {
    return [];
  }
  const results = await fetchSerpPayloadsForCalls(calls);
  return normalizeSerpCallResults(results);
}

export function scrapeMarkdownFromFirecrawl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.markdown === "string" && record.markdown.trim()) {
    return record.markdown;
  }
  const data = record.data;
  if (data && typeof data === "object") {
    const markdown = (data as Record<string, unknown>).markdown;
    if (typeof markdown === "string" && markdown.trim()) {
      return markdown;
    }
  }
  return null;
}

export async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += concurrency) {
    const chunk = items.slice(index, index + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((item, chunkIndex) => fn(item, index + chunkIndex)),
    );
    results.push(...chunkResults);
  }
  return results;
}

export function roleForChatModel(role: string): string {
  if (role === "agent" || role === "assistant") {
    return "assistant";
  }
  return role;
}
