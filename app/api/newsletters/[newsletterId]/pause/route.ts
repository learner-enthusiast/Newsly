import { requireAuthenticatedUser } from "@/lib/auth";
import { setNewsletterActive } from "@/services/newsletter/newsletterService";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({ isActive: z.boolean() });

export async function POST(
  request: Request,
  context: { params: Promise<{ newsletterId: string }> },
) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { newsletterId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "isActive boolean required" }, { status: 400 });
  }
  const newsletter = await setNewsletterActive(
    user.id,
    newsletterId,
    parsed.data.isActive,
  );
  if (!newsletter) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ newsletter });
}
