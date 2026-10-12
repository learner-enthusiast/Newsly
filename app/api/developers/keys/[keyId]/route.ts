import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/auth";
import { revokeApiKey } from "@/services/developers/apiKeyService";

/** Revoke one of the signed-in user's keys. Immediate; works on any plan. */
export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/developers/keys/[keyId]">,
) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { keyId } = await context.params;
  if (!z.uuid().safeParse(keyId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const revoked = await revokeApiKey(user.id, keyId);
  if (!revoked) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
