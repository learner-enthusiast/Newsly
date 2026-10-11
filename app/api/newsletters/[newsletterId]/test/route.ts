import { requireAuthenticatedUser } from "@/lib/auth";
import { sendNewsletterTest } from "@/services/newsletter/newsletterService";
import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  context: { params: Promise<{ newsletterId: string }> },
) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { newsletterId } = await context.params;
  const ok = await sendNewsletterTest(user.id, newsletterId);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
