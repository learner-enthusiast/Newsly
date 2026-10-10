import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/auth";
import { searchInstrumentsByNameOrShortName } from "@/repositories/instrument";

const SUGGESTION_LIMIT = 10;

const suggestQuerySchema = z.object({
  q: z.string().trim().min(1, "q is required"),
  segment: z.string().trim().min(1).optional(),
  instrumentType: z.string().trim().min(1).optional(),
});

export type InstrumentSuggestion = {
  instrumentKey: string;
  name: string;
  shortName: string | null;
  tradingSymbol: string;
  exchange: string;
  segment: string;
  instrumentType: string;
};

export async function GET(request: NextRequest) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const parsed = suggestQuerySchema.safeParse({
    q: searchParams.get("q") ?? "",
    segment: searchParams.get("segment") ?? undefined,
    instrumentType: searchParams.get("instrumentType") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const instruments = await searchInstrumentsByNameOrShortName({
    query: parsed.data.q,
    segment: parsed.data.segment,
    instrumentType: parsed.data.instrumentType,
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
