import { resolveUserLocationFromCoordinates } from "@/services/location/resolveUserLocation";
import { requireAuthenticatedUser } from "@/lib/auth";
import { withUserProviderUsage } from "@/lib/usage/requestUsage";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export async function POST(request: Request) {
  // Spends SerpApi credits: signed-in users only.
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    const location = await withUserProviderUsage(
      { userId: user.id, workflow: "Location reverse geocode" },
      () =>
        resolveUserLocationFromCoordinates(
          parsed.data.latitude,
          parsed.data.longitude,
        ),
    );
    return NextResponse.json({ location });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to resolve location";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
