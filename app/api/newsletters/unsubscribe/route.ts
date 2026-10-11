import { deactivateNewsletter } from "@/repositories/newsletter";
import { verifyNewsletterUnsubscribeToken } from "@/lib/newsletter/unsubscribeToken";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const token = request.nextUrl.searchParams.get("token");
  if (!id || !token || !verifyNewsletterUnsubscribeToken(id, token)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }
  await deactivateNewsletter(id);
  return NextResponse.json({ ok: true });
}
