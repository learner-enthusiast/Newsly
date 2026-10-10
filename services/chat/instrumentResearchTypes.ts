import { z } from "zod";

/** One Upstox tool response, compacted to JSON text sized for an LLM prompt. */
export const instrumentToolDataSchema = z.object({
  tool: z.string().min(1),
  data: z.string(),
});

export const instrumentMarketDataSchema = z.object({
  instrumentKey: z.string().min(1),
  name: z.string().min(1),
  tradingSymbol: z.string().min(1),
  exchange: z.string().min(1),
  instrumentType: z.string(),
  isin: z.string().nullable(),
  confidence: z.enum(["high", "medium"]),
  tools: z.array(instrumentToolDataSchema),
  /** Tools that were planned but failed (so the model can note data gaps). */
  unavailableTools: z.array(z.string()),
});

/**
 * Upstox market data for instruments the prompt is about. Passed to the final
 * chat / story model as `marketData`; null when the prompt is not stock-specific.
 */
export const chatMarketDataSchema = z.object({
  title: z.string().min(1),
  asOf: z.string().min(1),
  instruments: z.array(instrumentMarketDataSchema).min(1),
});

export type InstrumentMarketData = z.infer<typeof instrumentMarketDataSchema>;
export type ChatMarketData = z.infer<typeof chatMarketDataSchema>;
