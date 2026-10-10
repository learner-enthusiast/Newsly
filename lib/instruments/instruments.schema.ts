import { z } from "zod";

/** One row from Upstox BOD JSON (extra vendor fields allowed via passthrough). */
export const InstrumentSchema = z
  .object({
    instrument_key: z.string().min(1),
    segment: z.string().min(1),
    exchange: z.string().min(1),
    /** Some GLOBAL_INDEX rows ship with an empty type; store as-is for raw fidelity. */
    instrument_type: z.string(),
    trading_symbol: z.string().min(1),
    name: z.string().min(1),
    exchange_token: z.union([z.string(), z.number()]).transform(String),
    isin: z.string().optional(),
    short_name: z.string().optional(),
    security_type: z.string().optional(),
    lot_size: z.number().optional(),
    freeze_quantity: z.number().optional(),
    tick_size: z.number().optional(),
    expiry: z.number().optional(),
    strike_price: z.number().optional(),
    weekly: z.boolean().optional(),
    minimum_lot: z.number().optional(),
    underlying_symbol: z.string().optional(),
    underlying_key: z.string().optional(),
    underlying_type: z.string().optional(),
  })
  .passthrough();

export type Instrument = z.infer<typeof InstrumentSchema>;

export const InstrumentFileSchema = z.array(InstrumentSchema);
