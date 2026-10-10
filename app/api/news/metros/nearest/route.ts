import { resolveNearestSerializedNewsMetro } from "@/services/news/metroLocation";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  maxKm: z.number().positive().max(500).optional(),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "latitude and longitude are required" },
      { status: 400 },
    );
  }

  try {
    const metro = await resolveNearestSerializedNewsMetro(
      parsed.data.latitude,
      parsed.data.longitude,
      parsed.data.maxKm,
    );
    if (!metro) {
      return NextResponse.json(
        { error: "No metro found within range of your location" },
        { status: 404 },
      );
    }
    return NextResponse.json({ metro });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Nearest metro lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
