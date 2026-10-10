/**
 * CLI: sync Upstox BOD instruments into Postgres.
 * Usage: pnpm instruments:sync [NSE|BSE|MCX|ALL]
 */
import "dotenv/config";
import {
  createInstrumentSyncPool,
  syncInstruments,
  type InstrumentSyncSource,
} from "@/lib/instruments/syncInstruments";

const SOURCES = new Set<InstrumentSyncSource>(["NSE", "BSE", "MCX", "ALL"]);

function parseSource(argv: string | undefined): InstrumentSyncSource {
  const value = (argv ?? "ALL").toUpperCase();
  if (!SOURCES.has(value as InstrumentSyncSource)) {
    throw new Error(`Unknown source "${argv}". Use NSE, BSE, MCX, or ALL.`);
  }
  return value as InstrumentSyncSource;
}

async function main() {
  const source = parseSource(process.argv[2]);
  const pool = createInstrumentSyncPool();

  try {
    const result = await syncInstruments(pool, source);
    console.log(
      `source=${source} total=${result.total} inserted=${result.inserted} updated=${result.updated} unchanged=${result.unchanged}`,
    );
    if (result.newKeys.length > 0) {
      const preview = result.newKeys.slice(0, 20).join(", ");
      console.log(
        `new (${result.newKeys.length}): ${preview}${result.newKeys.length > 20 ? " …" : ""}`,
      );
    }
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
