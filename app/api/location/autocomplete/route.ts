import { fetchLocationAutocompleteCached } from "@/services/location/autocompleteServerCache";
import { MIN_AUTOCOMPLETE_QUERY_LENGTH } from "@/services/location/autocompleteQuery";
import { NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({
  q: z.string().min(1),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  cp: z.coerce.number().int().min(0).optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: searchParams.get("q") ?? "",
    latitude: searchParams.get("latitude") ?? undefined,
    longitude: searchParams.get("longitude") ?? undefined,
    cp: searchParams.get("cp") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Query q is required (min 1 character)" },
      { status: 400 },
    );
  }

  const { q, latitude, longitude, cp } = parsed.data;
  if (q.trim().length < MIN_AUTOCOMPLETE_QUERY_LENGTH) {
    return NextResponse.json({ suggestions: [] });
  }
  if (
    (latitude !== undefined && longitude === undefined) ||
    (longitude !== undefined && latitude === undefined)
  ) {
    return NextResponse.json(
      { error: "Provide both latitude and longitude, or neither" },
      { status: 400 },
    );
  }

  try {
    const suggestions = await fetchLocationAutocompleteCached({
      q,
      latitude,
      longitude,
      cp,
    });
    return NextResponse.json({ suggestions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Autocomplete lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
