/** Mutual fund suggestions (listed fund units, not ETFs) for MF research search. */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { InstrumentSuggestion } from "@/app/api/instruments/suggest/route";
import { requireAuthenticatedUser } from "@/lib/auth";
import { FUND_EQ_SEGMENTS, searchMutualFundsByNameOrShortName } from "@/repositories/instrument";

const SUGGESTION_LIMIT = 10;

const fundEqSegmentSchema = z.enum(FUND_EQ_SEGMENTS);

const suggestQuerySchema = z.object({
  q: z.string().trim().min(1, "q is required"),
  segment: fundEqSegmentSchema.optional(),
});

export async function GET(request: NextRequest) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const parsed = suggestQuerySchema.safeParse({
    q: searchParams.get("q") ?? "",
    segment: searchParams.get("segment") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const instruments = await searchMutualFundsByNameOrShortName({
    query: parsed.data.q,
    segment: parsed.data.segment,
    limit: SUGGESTION_LIMIT,
  });

  const suggestions: InstrumentSuggestion[] = instruments.map((row) => ({
    instrumentKey: row.instrumentKey,
    name: row.name,
    shortName: row.shortName,
    tradingSymbol: row.tradingSymbol,
    exchange: row.exchange,
    segment: row.segment,
    instrumentType: row.instrumentType,
  }));

  return NextResponse.json({ suggestions });
}
