/**
 * Token usage and USD cost per LLM call. Neatlogs records token counts on the
 * wrapped OpenAI spans but no cost, so cost is computed here and summed onto
 * agent / run spans.
 *
 * Prices are USD per 1M tokens. gpt-4o-mini: OpenAI pricing page.
 * gpt-5.4-mini: third-party pricing pages (pricepertoken.com, llmreference.com),
 * 2026-10 — confirm against https://openai.com/api/pricing. Unknown models
 * report `costUsd: null` rather than a guess. Override any price with
 * `LLM_PRICES_JSON='{"model":{"input":0.1,"output":0.4}}'`.
 */

type ModelPrice = { input: number; output: number; cachedInput?: number };

const DEFAULT_PRICES: Record<string, ModelPrice> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6, cachedInput: 0.075 },
  "gpt-5.4-mini": { input: 0.75, output: 4.5, cachedInput: 0.075 },
};

let cachedPrices: Record<string, ModelPrice> | undefined;

function prices(): Record<string, ModelPrice> {
  if (cachedPrices) {
    return cachedPrices;
  }
  let overrides: Record<string, ModelPrice> = {};
  const raw = process.env.LLM_PRICES_JSON?.trim();
  if (raw) {
    try {
      overrides = JSON.parse(raw) as Record<string, ModelPrice>;
    } catch {
      console.warn("[observability] LLM_PRICES_JSON is not valid JSON; ignoring it");
    }
  }
  cachedPrices = { ...DEFAULT_PRICES, ...overrides };
  return cachedPrices;
}

/** Longest known model id that prefixes `model` (handles dated snapshots). */
function priceFor(model: string): ModelPrice | null {
  const id = model.trim().toLowerCase();
  let best: string | null = null;
  for (const key of Object.keys(prices())) {
    if (id.startsWith(key) && (!best || key.length > best.length)) {
      best = key;
    }
  }
  return best ? prices()[best] : null;
}

export type LlmUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  costUsd: number | null;
};

export function priceLlmUsage(input: {
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  reasoningTokens?: number | null;
}): LlmUsage {
  const inputTokens = input.inputTokens ?? 0;
  const outputTokens = input.outputTokens ?? 0;
  const cachedInputTokens = input.cachedInputTokens ?? 0;
  const price = priceFor(input.model);
  const costUsd = price
    ? ((inputTokens - cachedInputTokens) * price.input +
        cachedInputTokens * (price.cachedInput ?? price.input) +
        outputTokens * price.output) /
      1_000_000
    : null;
  return {
    model: input.model,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    reasoningTokens: input.reasoningTokens ?? 0,
    costUsd,
  };
}

export type UsageTotals = {
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  /** null when any call used a model without a known price. */
  costUsd: number | null;
  models: string[];
};

export function emptyUsageTotals(): UsageTotals {
  return {
    llmCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    costUsd: 0,
    models: [],
  };
}

export function addUsage(totals: UsageTotals, usage: LlmUsage): void {
  totals.llmCalls += 1;
  totals.inputTokens += usage.inputTokens;
  totals.outputTokens += usage.outputTokens;
  totals.reasoningTokens += usage.reasoningTokens;
  totals.costUsd =
    totals.costUsd == null || usage.costUsd == null
      ? null
      : totals.costUsd + usage.costUsd;
  if (!totals.models.includes(usage.model)) {
    totals.models.push(usage.model);
  }
}
