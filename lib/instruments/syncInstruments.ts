import { gunzipSync } from "node:zlib";
import type { Pool } from "pg";
import { Pool as PgPool } from "pg";
import {
  InstrumentFileSchema,
  type Instrument,
} from "@/lib/instruments/instruments.schema";

export const INSTRUMENT_FILE_URLS = {
  NSE: "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz",
  BSE: "https://assets.upstox.com/market-quote/instruments/exchange/BSE.json.gz",
  MCX: "https://assets.upstox.com/market-quote/instruments/exchange/MCX.json.gz",
  ALL: "https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz",
} as const;

export type InstrumentSyncSource = keyof typeof INSTRUMENT_FILE_URLS;

export type SyncInstrumentsResult = {
  total: number;
  inserted: number;
  updated: number;
  unchanged: number;
  newKeys: string[];
};

const BATCH_SIZE = 2000;

const UPSERT_SQL = `
INSERT INTO instruments (
  instrument_key, segment, exchange, instrument_type, trading_symbol, name, exchange_token,
  isin, short_name, security_type, lot_size, freeze_quantity, tick_size,
  expiry, strike_price, weekly, minimum_lot, underlying_symbol, underlying_key, underlying_type,
  raw, updated_at
)
SELECT
  r.instrument_key, r.segment, r.exchange, r.instrument_type, r.trading_symbol, r.name, r.exchange_token,
  r.isin, r.short_name, r.security_type, r.lot_size, r.freeze_quantity, r.tick_size,
  CASE WHEN r.expiry IS NULL THEN NULL ELSE to_timestamp(r.expiry / 1000.0) END,
  r.strike_price, r.weekly, r.minimum_lot, r.underlying_symbol, r.underlying_key, r.underlying_type,
  r.raw, now()
FROM jsonb_to_recordset($1::jsonb) AS r(
  instrument_key text, segment text, exchange text, instrument_type text, trading_symbol text,
  name text, exchange_token text, isin text, short_name text, security_type text,
  lot_size integer, freeze_quantity numeric, tick_size numeric, expiry bigint,
  strike_price numeric, weekly boolean, minimum_lot integer, underlying_symbol text,
  underlying_key text, underlying_type text, raw jsonb
)
ON CONFLICT (instrument_key) DO UPDATE SET
  segment           = EXCLUDED.segment,
  exchange          = EXCLUDED.exchange,
  instrument_type   = EXCLUDED.instrument_type,
  trading_symbol    = EXCLUDED.trading_symbol,
  name              = EXCLUDED.name,
  exchange_token    = EXCLUDED.exchange_token,
  isin              = EXCLUDED.isin,
  short_name        = EXCLUDED.short_name,
  security_type     = EXCLUDED.security_type,
  lot_size          = EXCLUDED.lot_size,
  freeze_quantity   = EXCLUDED.freeze_quantity,
  tick_size         = EXCLUDED.tick_size,
  expiry            = EXCLUDED.expiry,
  strike_price      = EXCLUDED.strike_price,
  weekly            = EXCLUDED.weekly,
  minimum_lot       = EXCLUDED.minimum_lot,
  underlying_symbol = EXCLUDED.underlying_symbol,
  underlying_key    = EXCLUDED.underlying_key,
  underlying_type   = EXCLUDED.underlying_type,
  raw               = EXCLUDED.raw,
  updated_at        = now()
WHERE instruments.raw IS DISTINCT FROM EXCLUDED.raw
RETURNING instrument_key, (xmax = 0) AS inserted;
`;

export function createInstrumentSyncPool(connectionString?: string): PgPool {
  const url =
    connectionString?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.DB_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL or DB_URL is required for instrument sync.");
  }
  return new PgPool({ connectionString: url });
}

export async function downloadUpstoxInstruments(
  source: InstrumentSyncSource = "ALL",
): Promise<Instrument[]> {
  const url = INSTRUMENT_FILE_URLS[source];
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (instrument-sync)" },
  });
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText} (${url})`);
  }

  const json = JSON.parse(
    gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8"),
  );
  return InstrumentFileSchema.parse(json);
}

function emptyToNull(value: string | undefined): string | null {
  if (value == null || value.trim() === "") {
    return null;
  }
  return value;
}

function toUpsertRow(instrument: Instrument) {
  return {
    instrument_key: instrument.instrument_key,
    segment: instrument.segment,
    exchange: instrument.exchange,
    instrument_type: instrument.instrument_type,
    trading_symbol: instrument.trading_symbol,
    name: instrument.name,
    exchange_token: instrument.exchange_token,
    isin: emptyToNull(instrument.isin),
    short_name: emptyToNull(instrument.short_name),
    security_type: emptyToNull(instrument.security_type),
    lot_size: instrument.lot_size ?? null,
    freeze_quantity: instrument.freeze_quantity ?? null,
    tick_size: instrument.tick_size ?? null,
    expiry: instrument.expiry ?? null,
    strike_price: instrument.strike_price ?? null,
    weekly: instrument.weekly ?? null,
    minimum_lot: instrument.minimum_lot ?? null,
    underlying_symbol: emptyToNull(instrument.underlying_symbol),
    underlying_key: emptyToNull(instrument.underlying_key),
    underlying_type: emptyToNull(instrument.underlying_type),
    raw: instrument,
  };
}

/** Download Upstox BOD file, validate, and upsert into Postgres in batches. */
export async function syncInstruments(
  pool: Pool,
  source: InstrumentSyncSource = "ALL",
): Promise<SyncInstrumentsResult> {
  const instruments = await downloadUpstoxInstruments(source);

  const unique = [
    ...new Map(instruments.map((i) => [i.instrument_key, i])).values(),
  ];
  const rows = unique.map(toUpsertRow);

  const result: SyncInstrumentsResult = {
    total: rows.length,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    newKeys: [],
  };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { rows: changed } = await client.query<{
        instrument_key: string;
        inserted: boolean;
      }>(UPSERT_SQL, [JSON.stringify(batch)]);

      for (const row of changed) {
        if (row.inserted) {
          result.inserted++;
          result.newKeys.push(row.instrument_key);
        } else {
          result.updated++;
        }
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  result.unchanged = result.total - result.inserted - result.updated;
  return result;
}
