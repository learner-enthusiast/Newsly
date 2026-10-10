import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import {
  __setUpstoxClientForTests,
  createUpstoxClient,
} from "@/clients/upstoxClient";
import { __forceUpstoxHttpFallbackForTests } from "@/services/upstox/upstoxSdk";
import {
  authorizeMarketDataFeed,
  UpstoxMarketDataFeedClient,
} from "@/services/upstox/marketDataWebsocket";

class MockSdkStreamer extends EventEmitter {
  Event = {
    OPEN: "open",
    CLOSE: "close",
    MESSAGE: "message",
    ERROR: "error",
    RECONNECTING: "reconnecting",
    AUTO_RECONNECT_STOPPED: "autoReconnectStopped",
  };

  sent: Array<{ method: string; keys: string[]; mode?: string }> = [];

  async connect() {
    this.emit(this.Event.OPEN);
  }

  subscribe(instrumentKeys: string[], mode: string) {
    this.sent.push({ method: "sub", keys: instrumentKeys, mode });
  }

  unsubscribe(instrumentKeys: string[]) {
    this.sent.push({ method: "unsub", keys: instrumentKeys });
  }

  changeMode(instrumentKeys: string[], mode: string) {
    this.sent.push({ method: "change_mode", keys: instrumentKeys, mode });
  }

  disconnect() {
    this.emit(this.Event.CLOSE);
  }
}

test("authorizeMarketDataFeed uses HTTP fallback when forced", async () => {
  __forceUpstoxHttpFallbackForTests(true);
  __setUpstoxClientForTests(
    createUpstoxClient({
      analyticsToken: "unit-test",
      fetchImpl: async () =>
        Response.json({
          status: "success",
          data: {
            authorized_redirect_uri: "wss://example.test/feed",
          },
        }),
    }),
  );
  try {
    const uri = await authorizeMarketDataFeed();
    assert.equal(uri, "wss://example.test/feed");
  } finally {
    __forceUpstoxHttpFallbackForTests(false);
    __setUpstoxClientForTests(null);
  }
});

test("feed client wraps SDK streamer subscribe", async () => {
  const mock = new MockSdkStreamer();
  const client = new UpstoxMarketDataFeedClient({
    streamerFactory: () => mock as unknown as import("@/services/upstox/upstoxSdk").UpstoxSdkMarketDataStreamer,
  });

  await client.connect();
  client.subscribe(["NSE_EQ|INE002A01018"], "full");
  assert.equal(mock.sent.length, 1);
  assert.equal(mock.sent[0]?.mode, "full");
  client.shutdown();
});

test("feed client parses SDK message JSON", async () => {
  const mock = new MockSdkStreamer();
  const payloads: Record<string, unknown>[] = [];
  const client = new UpstoxMarketDataFeedClient({
    streamerFactory: () => mock as unknown as import("@/services/upstox/upstoxSdk").UpstoxSdkMarketDataStreamer,
  });
  client.onEvent((event) => {
    if (event.type === "feed") {
      payloads.push(event.payload);
    }
  });

  await client.connect();
  mock.emit(mock.Event.MESSAGE, JSON.stringify({ type: 1, currentTs: 99 }));
  assert.equal(Number(payloads[0]?.currentTs), 99);
  client.shutdown();
});
