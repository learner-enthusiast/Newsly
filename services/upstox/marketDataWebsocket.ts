import { getUpstoxClient } from "@/clients/upstoxClient";
import type {
  UpstoxMarketFeedAuthorizeResponse,
  UpstoxMarketFeedMode,
} from "@/services/upstox/types";
import { assertInstrumentKeys } from "@/services/upstox/validation";
import {
  createMarketDataStreamerV3,
  upstoxSdk,
  withUpstoxTransport,
  type UpstoxSdkMarketDataStreamer,
} from "@/services/upstox/upstoxSdk";

export type MarketDataFeedEvent =
  | { type: "connected" }
  | { type: "disconnected" }
  | { type: "feed"; payload: Record<string, unknown> }
  | { type: "error"; error: Error };

export type UpstoxMarketDataFeedClientOptions = {
  defaultMode?: UpstoxMarketFeedMode;
  initialInstrumentKeys?: string[];
  streamerFactory?: (
    instrumentKeys: string[],
    mode: UpstoxMarketFeedMode,
  ) => UpstoxSdkMarketDataStreamer;
};

async function authorizeMarketDataFeedHttp(): Promise<string> {
  const client = getUpstoxClient();
  const response = await client.get<UpstoxMarketFeedAuthorizeResponse>(
    "/v3/feed/market-data-feed/authorize",
    { noRetry: true },
  );
  const uri = response.data?.authorized_redirect_uri?.trim();
  if (!uri) {
    throw new Error("Upstox did not return authorized_redirect_uri.");
  }
  return uri;
}

/**
 * One-time WSS URL for Market Data Feed V3 (SDK primary, HTTP fallback).
 */
export async function authorizeMarketDataFeed(): Promise<string> {
  const response = await withUpstoxTransport<UpstoxMarketFeedAuthorizeResponse>({
    sdk: () => upstoxSdk.websocket.authorizeMarketDataFeedV3(),
    http: async () => {
      const uri = await authorizeMarketDataFeedHttp();
      return {
        status: "success",
        data: { authorized_redirect_uri: uri },
      };
    },
  });
  const uri = response.data?.authorized_redirect_uri?.trim();
  if (!uri) {
    throw new Error("Upstox did not return authorized_redirect_uri.");
  }
  return uri;
}

/**
 * Newsly-facing wrapper over official `MarketDataStreamerV3`.
 */
export class UpstoxMarketDataFeedClient {
  private readonly streamer: UpstoxSdkMarketDataStreamer;
  private readonly listeners = new Set<(event: MarketDataFeedEvent) => void>();
  private readonly Event: UpstoxSdkMarketDataStreamer["Event"];

  constructor(options: UpstoxMarketDataFeedClientOptions = {}) {
    const mode = options.defaultMode ?? "ltpc";
    const keys = options.initialInstrumentKeys ?? [];
    const factory =
      options.streamerFactory ??
      ((instrumentKeys, streamMode) =>
        createMarketDataStreamerV3(instrumentKeys, streamMode));
    this.streamer = factory(keys, mode);
    this.Event = this.streamer.Event;
    this.bindStreamerEvents();
  }

  onEvent(listener: (event: MarketDataFeedEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: MarketDataFeedEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private bindStreamerEvents(): void {
    this.streamer.on(this.Event.OPEN, () => {
      this.emit({ type: "connected" });
    });
    this.streamer.on(this.Event.CLOSE, () => {
      this.emit({ type: "disconnected" });
    });
    this.streamer.on(this.Event.ERROR, (error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit({ type: "error", error: err });
    });
    this.streamer.on(this.Event.MESSAGE, (raw: unknown) => {
      try {
        const text = typeof raw === "string" ? raw : String(raw);
        const payload = JSON.parse(text) as Record<string, unknown>;
        this.emit({ type: "feed", payload });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.emit({ type: "error", error: err });
      }
    });
  }

  async connect(): Promise<void> {
    await this.streamer.connect();
  }

  subscribe(instrumentKeys: string[], mode?: UpstoxMarketFeedMode): void {
    const keys = assertInstrumentKeys(instrumentKeys);
    this.streamer.subscribe(keys, mode ?? "ltpc");
  }

  unsubscribe(instrumentKeys: string[]): void {
    const keys = assertInstrumentKeys(instrumentKeys);
    this.streamer.unsubscribe(keys);
  }

  changeMode(instrumentKeys: string[], mode: UpstoxMarketFeedMode): void {
    const keys = assertInstrumentKeys(instrumentKeys);
    this.streamer.changeMode(keys, mode);
  }

  shutdown(): void {
    this.streamer.disconnect();
  }
}

/** Factory alias for research-layer code. */
export function createMarketDataStreamer(
  instrumentKeys: string[] = [],
  mode: UpstoxMarketFeedMode = "ltpc",
): UpstoxMarketDataFeedClient {
  return new UpstoxMarketDataFeedClient({
    initialInstrumentKeys: instrumentKeys,
    defaultMode: mode,
  });
}
