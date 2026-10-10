import assert from "node:assert/strict";
import { test } from "node:test";
import {
  __setUpstoxClientForTests,
  createUpstoxClient,
  UpstoxApiError,
} from "@/clients/upstoxClient";
import {
  __forceUpstoxHttpFallbackForTests,
  upstoxSdk,
} from "@/services/upstox/upstoxSdk";
import { getBrokerageCharges } from "@/services/upstox/charges";
import { getHistoricalCandles } from "@/services/upstox/historicalData";
import { getIpos } from "@/services/upstox/ipo";
import { assertMarginApiNotUsed } from "@/services/upstox/margins";
import { getFullMarketQuotes } from "@/services/upstox/marketQuote";
import { getExchangeStatus } from "@/services/upstox/marketInformation";
import { getInstrumentNews } from "@/services/upstox/news";
import { getOptionChain } from "@/services/upstox/optionChain";

function mockClient(fetchImpl: typeof fetch) {
  __forceUpstoxHttpFallbackForTests(true);
  __setUpstoxClientForTests(
    createUpstoxClient({
      analyticsToken: "unit-test-token",
      fetchImpl,
    }),
  );
}

function resetMocks() {
  __forceUpstoxHttpFallbackForTests(false);
  __setUpstoxClientForTests(null);
}

test("getFullMarketQuotes calls V3 quotes endpoint", async () => {
  let capturedUrl = "";
  mockClient(async (input) => {
    capturedUrl = String(input);
    return Response.json({
      status: "success",
      data: {
        "NSE_EQ:TEST": {
          instrument_token: "NSE_EQ|INE000A00000",
          last_price: 42,
        },
      },
    });
  });

  try {
    const response = await getFullMarketQuotes(["NSE_EQ|INE000A00000"]);
    assert.equal(response.data["NSE_EQ:TEST"]?.last_price, 42);
    assert.match(capturedUrl, /\/v3\/market-quote\/quotes/);
  } finally {
    resetMocks();
  }
});

test("getFullMarketQuotes rejects empty instrument keys", async () => {
  mockClient(async () => Response.json({ status: "success", data: {} }));
  try {
    await assert.rejects(
      () => getFullMarketQuotes([]),
      (err: unknown) =>
        err instanceof UpstoxApiError && err.kind === "invalid_request",
    );
  } finally {
    resetMocks();
  }
});

test("getHistoricalCandles validates unit", async () => {
  mockClient(async () => Response.json({ status: "success", data: {} }));
  try {
    await assert.rejects(() =>
      getHistoricalCandles({
        instrumentKey: "NSE_EQ|INE002A01018",
        unit: "invalid",
        interval: "1",
        toDate: "2026-01-01",
      }),
    );
  } finally {
    resetMocks();
  }
});

test("getBrokerageCharges builds query params", async () => {
  let url = "";
  mockClient(async (input) => {
    url = String(input);
    return Response.json({
      status: "success",
      data: { charges: { total: 10 } },
    });
  });
  try {
    const response = await getBrokerageCharges({
      instrumentToken: "NSE_EQ|INE669E01016",
      quantity: 10,
      product: "D",
      transactionType: "BUY",
      price: 13.7,
    });
    assert.equal(response.data.charges?.total, 10);
    assert.match(url, /\/v2\/charges\/brokerage/);
    assert.match(url, /product=D/);
  } finally {
    resetMocks();
  }
});

test("margin API is not available with analytics token", () => {
  assert.throws(() => assertMarginApiNotUsed(), UpstoxApiError);
});

test("getInstrumentNews uses instrument_keys category only", async () => {
  let url = "";
  mockClient(async (input) => {
    url = String(input);
    return Response.json({
      status: "success",
      data: { "NSE_EQ|INE040H01021": [] },
      metadata: { page: { page_number: 1 } },
    });
  });
  try {
    await getInstrumentNews({
      instrumentKeys: ["NSE_EQ|INE040H01021"],
      pageNumber: 1,
      pageSize: 10,
    });
    assert.match(url, /category=instrument_keys/);
    assert.doesNotMatch(url, /category=positions/);
  } finally {
    resetMocks();
  }
});

test("getIpos validates status", async () => {
  mockClient(async () => Response.json({ status: "success", data: [] }));
  try {
    await assert.rejects(() => getIpos({ status: "not-a-status" as "open" }));
  } finally {
    resetMocks();
  }
});

test("getOptionChain requires expiry_date", async () => {
  mockClient(async () => Response.json({ status: "success", data: [] }));
  try {
    await assert.rejects(() =>
      getOptionChain({
        instrumentKey: "NSE_INDEX|Nifty 50",
        expiryDate: "not-a-date",
      }),
    );
  } finally {
    resetMocks();
  }
});

test("getExchangeStatus calls market status endpoint", async () => {
  let path = "";
  mockClient(async (input) => {
    path = String(input);
    return Response.json({
      status: "success",
      data: { exchange: "NSE", status: "Open", last_updated: 1 },
    });
  });
  try {
    const response = await getExchangeStatus("NSE");
    assert.equal(response.data.status, "Open");
    assert.match(path, /\/v2\/market\/status\/NSE/);
  } finally {
    resetMocks();
  }
});

test("getFullMarketQuotes uses SDK when HTTP fallback is not forced", async () => {
  process.env.UPSTOX_ANALYTICS_TOKEN = "unit-test-token";
  const original = upstoxSdk.marketQuote.getFullMarketQuotes;
  upstoxSdk.marketQuote.getFullMarketQuotes = async () => ({
    status: "success",
    data: {
      "NSE_EQ:SDK": { last_price: 99, instrument_token: "NSE_EQ|SDK" },
    },
  });
  try {
    const { getFullMarketQuotes } = await import(
      "@/services/upstox/marketQuote"
    );
    const response = await getFullMarketQuotes(["NSE_EQ|SDK"]);
    assert.equal(response.data["NSE_EQ:SDK"]?.last_price, 99);
  } finally {
    upstoxSdk.marketQuote.getFullMarketQuotes = original;
    delete process.env.UPSTOX_ANALYTICS_TOKEN;
  }
});
