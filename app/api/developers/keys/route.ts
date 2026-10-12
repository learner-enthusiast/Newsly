import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/auth";
import {
  ApiKeyLimitError,
  ApiKeyPlanError,
  createApiKeyBodySchema,
  createApiKeyForUser,
  getDevelopersPayload,
} from "@/services/developers/apiKeyService";

/** Plan, limits, usage and keys for the signed-in user's Developers page. */
export async function GET() {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await getDevelopersPayload(user.id));
}

/** Create a key (Pro only). The full key is in this response and nowhere else. */
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

  const parsed = createApiKeyBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Validation failed",
        details: z.treeifyError(parsed.error),
      },
      { status: 400 },
    );
  }

  try {
    const result = await createApiKeyForUser(user.id, parsed.data);
    return NextResponse.json(result, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ApiKeyPlanError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof ApiKeyLimitError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Failed to create API key", error);
    return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
  }
}
