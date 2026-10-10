import {
  MARKET_WIDE_TOOL_KEYS,
  runInstrumentDeterminerAgent,
} from "@/Agents/chat/intrumentDeterminerAgent";
import type {
  StockResearchInstrument,
  UpstoxToolFlags,
} from "@/Agents/stockResearch/toolDeterminerAgent";
import { createResearchSource } from "@/repositories/researchSource";
import type {
  ChatMarketData,
  InstrumentMarketData,
} from "@/services/chat/instrumentResearchTypes";
import {
  mapResearchSourceForChatModel,
  type ChatModelResearchSourceRow,
} from "@/services/chat/researchContextForChatModel";
import { executeStockResearchUpstoxTools } from "@/services/stockResearch/executeStockResearchTools";
import { compactJsonForPrompt } from "@/services/stockResearch/researchContext";

/** Per-tool cap on JSON sent to the final model (keeps total market data small). */
const TOOL_DATA_MAX_CHARS = 4_000;
const RESEARCH_SOURCE_MAX_CHARS = 50_000;

export const UPSTOX_MARKET_DATA_SOURCE_TYPE = "upstox_market_data";

export type ChatInstrumentResearchResult = {
  marketData: ChatMarketData | null;
  /** ResearchSource rows saved for this run (empty when not persisted). */
  savedSources: ChatModelResearchSourceRow[];
};

function upstoxInstrumentUrl(instrument: StockResearchInstrument): string {
  if (instrument.isin) {
    const slug = instrument.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return `https://upstox.com/stocks/${slug}-share-price/${instrument.isin}/`;
  }
  return `https://upstox.com/?instrument=${encodeURIComponent(instrument.instrumentKey)}`;
}

/** Market-wide tools (FII/DII) only run for the first instrument. */
function flagsForInstrument(
  flags: UpstoxToolFlags,
  index: number,
): UpstoxToolFlags {
  if (index === 0) {
    return flags;
  }
  const next = { ...flags };
  for (const key of MARKET_WIDE_TOOL_KEYS) {
    next[key as keyof UpstoxToolFlags] = false;
  }
  return next;
}

function researchSourceContent(
  row: InstrumentMarketData,
  asOf: string,
): string {
  const header = [
    `Upstox market data for ${row.name} (${row.tradingSymbol}, ${row.exchange}).`,
    `Instrument key: ${row.instrumentKey}${row.isin ? ` · ISIN: ${row.isin}` : ""}`,
    `Fetched at: ${asOf}`,
    row.unavailableTools.length > 0
      ? `Unavailable: ${row.unavailableTools.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
  const sections = row.tools.map(
    (tool) => `### ${tool.tool}\n\`\`\`json\n${tool.data}\n\`\`\``,
  );
  return [header, ...sections].join("\n\n").slice(0, RESEARCH_SOURCE_MAX_CHARS);
}

/**
 * Detect instruments in an enhanced prompt, call the planned Upstox APIs in
 * parallel (instruments × tools), and optionally save one `ResearchSource` per
 * instrument for the chat session.
 *
 * Best-effort: any failure is logged and returns `{ marketData: null }` so the
 * calling chat pipeline still answers from web research.
 */
export async function runChatInstrumentResearch(params: {
  prompt: string;
  /** When set, results are saved as `ResearchSource` rows for this session. */
  chatSessionId?: string;
  abortSignal?: AbortSignal;
}): Promise<ChatInstrumentResearchResult> {
  try {
    const determiner = await runInstrumentDeterminerAgent({
      prompt: params.prompt,
      abortSignal: params.abortSignal,
    });
    if (
      !determiner.isAboutSpecificInstrument ||
      determiner.matches.length === 0
    ) {
      return { marketData: null, savedSources: [] };
    }

    const asOf = new Date().toISOString();
    const instruments = await Promise.all(
      determiner.matches.map(async (match, index) => {
        const results = await executeStockResearchUpstoxTools(
          flagsForInstrument(determiner.upstox, index),
          match.instrument,
        );
        const { instrument } = match;
        return {
          instrumentKey: instrument.instrumentKey,
          name: instrument.name,
          tradingSymbol: instrument.tradingSymbol,
          exchange: instrument.exchange,
          instrumentType: instrument.instrumentType,
          isin: instrument.isin,
          confidence: match.confidence,
          tools: results
            .filter((row) => row.ok && row.rawData != null)
            .map((row) => ({
              tool: row.tool,
              data: compactJsonForPrompt(row.rawData, TOOL_DATA_MAX_CHARS),
            })),
          unavailableTools: results
            .filter((row) => !row.ok && !row.skipped)
            .map((row) => row.tool),
        } satisfies InstrumentMarketData;
      }),
    );

    const withData = instruments.filter((row) => row.tools.length > 0);
    if (withData.length === 0) {
      return { marketData: null, savedSources: [] };
    }

    const marketData: ChatMarketData = {
      title: determiner.title ?? withData.map((row) => row.name).join(", "),
      asOf,
      instruments: withData,
    };

    const chatSessionId = params.chatSessionId;
    const savedSources = chatSessionId
      ? await Promise.all(
          withData.map(async (row) => {
            const instrument = determiner.matches.find(
              (match) => match.instrument.instrumentKey === row.instrumentKey,
            )!.instrument;
            const saved = await createResearchSource({
              chatSessionId,
              url: upstoxInstrumentUrl(instrument),
              domain: "upstox.com",
              title: `Upstox market data: ${row.name} (${row.tradingSymbol})`,
              content: researchSourceContent(row, asOf),
              sourceType: UPSTOX_MARKET_DATA_SOURCE_TYPE,
            });
            return mapResearchSourceForChatModel(saved);
          }),
        )
      : [];

    return { marketData, savedSources };
  } catch (error) {
    console.warn(
      JSON.stringify({
        scope: "chatInstrumentResearch",
        action: "failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return { marketData: null, savedSources: [] };
  }
}
