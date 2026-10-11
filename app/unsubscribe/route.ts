import { deactivateNewsletter } from "@/repositories/newsletter";
import { verifyNewsletterUnsubscribeToken } from "@/lib/newsletter/unsubscribeToken";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const token = url.searchParams.get("token");
  if (!id || !token || !verifyNewsletterUnsubscribeToken(id, token)) {
    return new NextResponse("Invalid unsubscribe link", { status: 400 });
  }
  await deactivateNewsletter(id);
  return new NextResponse(
    "<html><body><h1>Unsubscribed</h1><p>You will no longer receive this newsletter.</p></body></html>",
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const token = url.searchParams.get("token");
  if (!id || !token || !verifyNewsletterUnsubscribeToken(id, token)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }
  await deactivateNewsletter(id);
  return NextResponse.json({ ok: true });
}
