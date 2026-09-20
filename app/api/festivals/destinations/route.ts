import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { listFestivalDestinationOptions } from "@/services/festivals/listFestivalDestinations";

export async function GET() {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const destinations = await listFestivalDestinationOptions();

  return NextResponse.json({ destinations });
}
