import { NextResponse } from "next/server";
import { requireProApiUser } from "@/lib/requireProApiUser";
import { getOrCreateWebhookSecret, rotateWebhookSecret } from "@/lib/api/v1/webhooks";

function serialize(row: { secret: string; createdAt: Date; rotatedAt: Date | null }) {
  return {
    secret: row.secret,
    createdAt: row.createdAt.toISOString(),
    rotatedAt: row.rotatedAt?.toISOString() ?? null,
  };
}

/** The signed-in Pro user's webhook signing secret (created on first read). */
export async function GET() {
  const { user, response } = await requireProApiUser();
  if (!user) {
    return response;
  }
  return NextResponse.json(serialize(await getOrCreateWebhookSecret(user.id)));
}

/** Replace the secret; webhooks sent from now on are signed with the new one. */
export async function POST() {
  const { user, response } = await requireProApiUser();
  if (!user) {
    return response;
  }
  return NextResponse.json(serialize(await rotateWebhookSecret(user.id)));
}
