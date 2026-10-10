-- Upstox BOD instruments table (PostgreSQL)
-- One table for all instrument kinds; derivative-only columns are nullable.

CREATE TABLE IF NOT EXISTS "instruments" (
    "instrument_key" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "instrument_type" TEXT NOT NULL,
    "trading_symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "exchange_token" TEXT NOT NULL,
    "isin" TEXT,
    "short_name" TEXT,
    "security_type" TEXT,
    "lot_size" INTEGER,
    "freeze_quantity" DECIMAL,
    "tick_size" DECIMAL,
    "expiry" TIMESTAMPTZ(6),
    "strike_price" DECIMAL,
    "weekly" BOOLEAN,
    "minimum_lot" INTEGER,
    "underlying_symbol" TEXT,
    "underlying_key" TEXT,
    "underlying_type" TEXT,
    "raw" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instruments_pkey" PRIMARY KEY ("instrument_key")
);

CREATE INDEX IF NOT EXISTS "idx_instruments_symbol"
    ON "instruments"("segment", "instrument_type", "trading_symbol");

CREATE INDEX IF NOT EXISTS "idx_instruments_name"
    ON "instruments"("name");

CREATE INDEX IF NOT EXISTS "idx_instruments_short_name"
    ON "instruments"("short_name");
