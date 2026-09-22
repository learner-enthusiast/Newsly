import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { discoveryRequestSchema } from "@/domain/news/schemas/discovery";
import { discoveryService } from "@/services/news/discovery.service";
export async function POST(request: Request) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = discoveryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await discoveryService.startDiscovery({
    userId: user.id,
    request: parsed.data,
  });

  return NextResponse.json(
    {
      discoveryRunId: result.discoveryRunId,
      status: result.status,
    },
    { status: 202 },
  );
}
