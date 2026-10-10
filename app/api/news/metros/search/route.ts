import { searchNewsMetros } from "@/repositories/newsMetro";
import { serializeNewsMetro } from "@/services/news/metroLocation";
import { NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Query q is required" }, { status: 400 });
  }

  try {
    const metros = await searchNewsMetros({
      query: parsed.data.q,
      limit: parsed.data.limit,
    });
    return NextResponse.json({
      metros: metros.map(serializeNewsMetro),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Metro search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
